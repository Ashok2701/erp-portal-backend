"use strict";
const db                  = require("../config/db");
const TenantSettingsModel = require("../models/tenantSettings.model");
const ERPFactory          = require("../erp/erp.factory");
const emailService        = require("../services/email.service");

// ── LIST ALL TENANTS ─────────────────────────────────────────
// ── HELPER: verify partner can access this tenant ────────────
async function verifyPartnerAccess(req, tenantId) {
  const { system_role, user_id } = req.user;
  if (system_role === 'owner' || req.user.is_super_admin) return true;
  if (system_role !== 'partner_user') return false;

  // Get partner_id for this user
  const pu = await db.query(
    'SELECT partner_id FROM partner_users WHERE user_id=$1 AND is_active=true LIMIT 1',
    [user_id]
  );
  if (!pu.rows.length) return false;

  const partnerId = pu.rows[0].partner_id;

  // Check tenant belongs to this partner
  const t = await db.query(
    'SELECT tenant_id FROM tenants WHERE tenant_id=$1 AND partner_id=$2',
    [tenantId, partnerId]
  );
  return t.rows.length > 0;
}

exports.listTenants = async (req, res) => {
  try {
    const { system_role, user_id } = req.user;

    let query, params = [];

    if (system_role === "partner_user") {
      // Partner users only see their own tenants
      const pu = await db.query(
        "SELECT partner_id FROM partner_users WHERE user_id = $1 AND is_active = true LIMIT 1",
        [user_id]
      );
      if (!pu.rows.length)
        return res.json({ success: true, data: [] });

      query = `
        SELECT t.*,
          (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.tenant_id) AS user_count,
          ts.erp_system, ts.erp_db_host, ts.erp_db_name,
          ts.smtp_host, ts.x3_soap_url, ts.spaces_folder
        FROM tenants t
        LEFT JOIN tenant_settings ts ON ts.tenant_id = t.tenant_id
        WHERE t.partner_id = $1
        ORDER BY t.created_at ASC`;
      params = [pu.rows[0].partner_id];
    } else {
      // Owner sees all tenants
      query = `
        SELECT t.*,
          (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.tenant_id) AS user_count,
          ts.erp_system, ts.erp_db_host, ts.erp_db_name,
          ts.smtp_host, ts.x3_soap_url, ts.spaces_folder
        FROM tenants t
        LEFT JOIN tenant_settings ts ON ts.tenant_id = t.tenant_id
        ORDER BY t.created_at ASC`;
    }

    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ONE TENANT ───────────────────────────────────────────
exports.getTenant = async (req, res) => {
  try {
    const { id } = req.params;

    // Partner users can only access their own tenants
    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied — tenant not under your partner account' });
    }

    const t = await db.query("SELECT * FROM tenants WHERE tenant_id=$1", [id]);
    if (!t.rows.length) return res.status(404).json({ success: false, message: "Tenant not found" });

    const s = await TenantSettingsModel.getTenantSettings(id);

    // Mask passwords before sending to frontend
    const settings = { ...s };
    if (settings.erp_db_password) settings.erp_db_password = "••••••••";
    if (settings.x3_password)     settings.x3_password     = "••••••••";
    if (settings.smtp_password)   settings.smtp_password   = "••••••••";

    res.json({ success: true, data: { ...t.rows[0], settings } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CREATE TENANT ────────────────────────────────────────────
exports.createTenant = async (req, res) => {
  try {
    const { name, slug, plan = "starter", is_test = false, test_note, partner_id } = req.body;
    if (!name || !slug) return res.status(400).json({ success: false, message: "name and slug are required" });

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    const { system_role } = req.user;

    // Partner users can only create tenants under their own partner
    let resolvedPartnerId = partner_id || null;
    if (system_role === "partner_user") {
      const pu = await db.query(
        "SELECT partner_id FROM partner_users WHERE user_id = $1 AND is_active = true LIMIT 1",
        [req.user.user_id]
      );
      if (!pu.rows.length)
        return res.status(403).json({ success: false, message: "No active partner association found" });
      resolvedPartnerId = pu.rows[0].partner_id;
    }

    const result = await db.query(
      `INSERT INTO tenants (tenant_name, slug, plan, partner_id, is_test, test_note, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,NOW()) RETURNING *`,
      [name, cleanSlug, plan, resolvedPartnerId, is_test, test_note]
    );

    const tenant = result.rows[0];

    // Create default empty settings row
    await db.query(
      `INSERT INTO tenant_settings (tenant_id, spaces_folder) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [tenant.tenant_id, cleanSlug]
    );

    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ success: false, message: "Slug already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE TENANT ────────────────────────────────────────────
exports.updateTenant = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { name, plan, is_active } = req.body;

    const result = await db.query(
      `UPDATE tenants SET
         tenant_name = COALESCE($1, tenant_name),
         plan        = COALESCE($2, plan),
         is_active   = COALESCE($3, is_active)
       WHERE tenant_id=$4 RETURNING *`,
      [name, plan, is_active, id]
    );

    if (!result.rows.length) return res.status(404).json({ success: false, message: "Tenant not found" });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPSERT TENANT SETTINGS ───────────────────────────────────
exports.upsertSettings = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Don't overwrite passwords if masked value sent
    const body = { ...req.body };
    ["erp_db_password", "x3_password", "smtp_password"].forEach(field => {
      if (body[field] === "••••••••") delete body[field];
    });

    const data = await TenantSettingsModel.upsertTenantSettings(id, body);

    // Clear adapter cache so next request gets fresh connection
    ERPFactory.clearAdapterCache(id);
    emailService.clearTransporterCache(id);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET TENANT USERS ─────────────────────────────────────────
exports.getTenantUsers = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const result = await db.query(
      `SELECT u.user_id, u.username, u.full_name, u.email,
              u.status, u.is_active, u.portal_mode,
              u.is_super_admin, u.created_at, r.role_name
       FROM users u
       LEFT JOIN user_roles ur ON u.user_id=ur.user_id
       LEFT JOIN roles r ON ur.role_id=r.role_id
       WHERE u.tenant_id=$1 ORDER BY u.created_at DESC`,
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ASSIGN ADMIN TO TENANT ───────────────────────────────────
exports.assignAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get Administrator role for this tenant
    const roleResult = await db.query(
      `SELECT role_id FROM roles WHERE LOWER(role_name) LIKE '%admin%' AND (tenant_id=$1 OR tenant_id IS NULL) LIMIT 1`,
      [id]
    );
    if (!roleResult.rows.length) return res.status(404).json({ success: false, message: "Admin role not found" });

    await db.query("DELETE FROM user_roles WHERE user_id=$1", [user_id]);
    await db.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)", [user_id, roleResult.rows[0].role_id]);
    await db.query("UPDATE users SET tenant_id=$1, status='ACTIVE', is_active=true WHERE user_id=$2", [id, user_id]);

    res.json({ success: true, message: "Admin assigned" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── TEST ERP CONNECTION ──────────────────────────────────────
exports.testConnection = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const settings = await TenantSettingsModel.getTenantSettings(id);
    ERPFactory.clearAdapterCache(id);
    const adapter = await ERPFactory.getERPAdapterForUser({ tenant_id: id });
    const sites = await adapter.getAllSites().catch(() => []);
    res.json({ success: true, message: "ERP connection successful", sites_count: sites.length });
  } catch (err) {
    res.status(500).json({ success: false, message: `Connection failed: ${err.message}` });
  }
};

// ── CREATE TENANT USER (from tenant detail page) ──────────────
exports.createTenantUser = async (req, res) => {
  try {
    const { id: tenantId } = req.params;

    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, tenantId);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const {
      username, email, full_name, password,
      role_name    = 'Customer',
      portal_mode  = 'b2c',
      default_role,
      erp_mappings = [],   // [{ portal_type, erp_entity_type, erp_entity_code, allowedsite }]
    } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'username, email and password required' });

    const bcrypt = require('bcrypt');
    const hash   = await bcrypt.hash(password, 10);

    // Map default_role to portal_mode
    const resolvedPortalMode = portal_mode ||
      (default_role === 'Supplier' ? 'both' :
       default_role === 'B2B Customer' ? 'b2b' : 'b2c');

    const userResult = await db.query(
      `INSERT INTO users (username, email, full_name, password_hash, is_active, status,
        system_role, portal_mode, tenant_id, default_role)
       VALUES ($1,$2,$3,$4,true,'ACTIVE','tenant_user',$5,$6,$7)
       RETURNING user_id, username, email, full_name, is_active, status, created_at`,
      [username, email, full_name, hash, resolvedPortalMode, tenantId, default_role || role_name]
    );
    const user = userResult.rows[0];

    // Find and assign the requested role
    // First try tenant-specific role, then fall back to global roles
    let roleRes = await db.query(
      `SELECT role_id FROM roles
       WHERE tenant_id=$1 AND LOWER(role_name) = LOWER($2) LIMIT 1`,
      [tenantId, role_name]
    );

    // If no tenant-specific role found, auto-create default roles for this tenant
    if (!roleRes.rows.length) {
      const defaultRoles = [
        { code: 'ADMINISTRATOR', name: 'Administrator' },
        { code: 'CUSTOMER',      name: 'Customer'      },
        { code: 'B2B_CUSTOMER',  name: 'B2B Customer'  },
        { code: 'SUPPLIER',      name: 'Supplier'      },
      ];
      for (const r of defaultRoles) {
        await db.query(
          `INSERT INTO roles (role_id, role_code, role_name, is_active, tenant_id, description)
           VALUES (gen_random_uuid(),$1,$2,true,$3,$2 || ' role for tenant')
           ON CONFLICT DO NOTHING`,
          [r.code, r.name, tenantId]
        );
      }
      // Now assign default modules to roles
      const moduleAssignments = {
        'Administrator': ['Dashboard','Products','Orders','Invoices','Payments','Deliveries',
                         'Sales Requests','Sales Quote','Content Management','Users','Roles',
                         'Role Modules','Modules','Purchase Requests','Stock','Maintenance',
                         'Available','Consignment','In Transit','Reserved','Stock Requests'],
        'B2B Customer':  ['Dashboard','Orders','Invoices','Payments','Deliveries',
                         'Sales Requests','Sales Quote','Content Management',
                         'Available','Consignment','In Transit','Reserved','Stock Requests'],
        'Customer':      ['Dashboard','Products','Orders','Invoices','Payments',
                         'Deliveries','Sales Requests','Sales Quote','Content Management'],
        'Supplier':      ['Dashboard','Purchase Requests','Content Management'],
      };
      for (const [roleName, modules] of Object.entries(moduleAssignments)) {
        const rr = await db.query(
          `SELECT role_id FROM roles WHERE tenant_id=$1 AND role_name=$2 LIMIT 1`,
          [tenantId, roleName]
        );
        if (!rr.rows.length) continue;
        const rid = rr.rows[0].role_id;
        for (const modName of modules) {
          await db.query(
            `INSERT INTO role_modules (role_module_id, role_id, module_id, can_view, can_create, can_edit, can_delete)
             SELECT gen_random_uuid(), $1, module_id, true,
               CASE WHEN $2 = 'Administrator' THEN true ELSE false END,
               CASE WHEN $2 = 'Administrator' THEN true ELSE false END,
               CASE WHEN $2 = 'Administrator' THEN true ELSE false END
             FROM modules WHERE module_name=$3
             ON CONFLICT DO NOTHING`,
            [rid, roleName, modName]
          );
        }
      }
      // Re-query the role
      roleRes = await db.query(
        `SELECT role_id FROM roles
         WHERE tenant_id=$1 AND LOWER(role_name) = LOWER($2) LIMIT 1`,
        [tenantId, role_name]
      );
    }

    if (roleRes.rows.length) {
      await db.query(
        `INSERT INTO user_roles (user_role_id, user_id, role_id)
         VALUES (gen_random_uuid(),$1,$2) ON CONFLICT DO NOTHING`,
        [user.user_id, roleRes.rows[0].role_id]
      );
    }

    // Assign additional roles from erp_mappings (for multi-portal users)
    const portalToRole = {
      'CUSTOMER':    'Customer',
      'CONSIGNMENT': 'B2B Customer',
      'SUPPLIER':    'Supplier',
    };
    for (const mapping of erp_mappings) {
      const additionalRole = portalToRole[mapping.portal_type];
      if (additionalRole && additionalRole !== role_name) {
        const addRoleRes = await db.query(
          `SELECT role_id FROM roles WHERE tenant_id=$1 AND LOWER(role_name)=LOWER($2) LIMIT 1`,
          [tenantId, additionalRole]
        );
        if (addRoleRes.rows.length) {
          await db.query(
            `INSERT INTO user_roles (user_role_id, user_id, role_id)
             VALUES (gen_random_uuid(),$1,$2) ON CONFLICT DO NOTHING`,
            [user.user_id, addRoleRes.rows[0].role_id]
          );
        }
      }

      // Save ERP mapping for this portal
      if (mapping.erp_entity_code) {
        // is_default: use value from frontend, or true if this is the default portal
        const isDefaultMapping = mapping.is_default === true || mapping.portal_type === (
          default_role
            ? Object.keys(portalToRole).find(k => portalToRole[k] === default_role) || 'CUSTOMER'
            : 'CUSTOMER'
        );
        await db.query(
          `INSERT INTO user_role_erp_mapping
             (user_id, portal_type, erp_entity_type, erp_entity_code, allowedsite, is_default)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (user_id, portal_type)
           DO UPDATE SET
             erp_entity_type = EXCLUDED.erp_entity_type,
             erp_entity_code = EXCLUDED.erp_entity_code,
             allowedsite     = EXCLUDED.allowedsite,
             is_default      = EXCLUDED.is_default`,
          [user.user_id,
           mapping.portal_type,
           mapping.erp_entity_type || 'customer',
           mapping.erp_entity_code,
           mapping.allowedsite || '',
           isDefaultMapping]
        );
      }
    }

    res.status(201).json({ success: true, data: { ...user, role_name, default_role } });
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ success: false, message: 'Username or email already exists' });
    console.error('CREATE TENANT USER ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── RESET TENANT USER PASSWORD ────────────────────────────────
exports.resetTenantUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;
    if (!password || password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const bcrypt = require('bcrypt');
    const hash   = await bcrypt.hash(password, 10);

    await db.query('UPDATE users SET password_hash=$1 WHERE user_id=$2', [hash, userId]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('RESET PASSWORD ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── TOGGLE TENANT USER STATUS ─────────────────────────────────
exports.toggleTenantUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;
    await db.query('UPDATE users SET is_active=$1 WHERE user_id=$2', [is_active, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('TOGGLE USER ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── TENANT SETUP STATUS ─────────────────────────────────────────
exports.getTenantSetupStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.system_role === 'partner_user') {
      const allowed = await verifyPartnerAccess(req, id);
      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const TenantSettingsModel = require('../models/tenantSettings.model');
    const PortalGrantModel    = require('../models/portalGrant.model');

    const [tenantResult, settings, portalGrants, usersResult] = await Promise.all([
      db.query('SELECT * FROM tenants WHERE tenant_id=$1', [id]),
      TenantSettingsModel.getTenantSettings(id),
      PortalGrantModel.getActivePortalTypes(id),
      db.query(
        `SELECT u.user_id, u.username, u.system_role, u.is_active,
                u.default_role,
                (SELECT r.role_name FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 WHERE ur.user_id = u.user_id LIMIT 1) AS role_name
         FROM users u WHERE u.tenant_id=$1`,
        [id]
      ),
    ]);

    const tenant = tenantResult.rows[0];
    const users  = usersResult.rows;

    const adminUser = users.find(u =>
      u.role_name === 'Administrator' || u.role_name === 'Admin'
    );
    const hasERP   = !!(settings?.erp_db_host && settings?.erp_db_user);
    const hasX3    = !!(settings?.x3_soap_url);
    const hasSMTP  = !!(settings?.smtp_host);
    const hasPortals = portalGrants.length > 0;
    const hasAdmin = !!adminUser;
    const hasUsers = users.filter(u => u.role_name !== 'Administrator').length > 0;

    const steps = [
      {
        key:       'create_tenant',
        label:     'Create Tenant',
        desc:      'Tenant has been created with a name and slug',
        done:      true,        // always done if we got here
        required:  true,
        tab:       null,
        action:    null,
      },
      {
        key:       'grant_portals',
        label:     'Configure Portal Access',
        desc:      hasPortals
          ? `${portalGrants.length} portal${portalGrants.length > 1 ? 's' : ''} active: ${portalGrants.join(', ')}`
          : 'Select which portals this tenant can access (Customer / Consignment / Supplier)',
        done:      hasPortals,
        required:  true,
        tab:       'portals',
        action:    'Go to Portals tab',
      },
      {
        key:       'erp_config',
        label:     'Configure ERP Database',
        desc:      hasERP
          ? `Connected to: ${settings.erp_db_host} / ${settings.erp_db_name}`
          : 'Add Sage X3 database connection credentials',
        done:      hasERP,
        required:  true,
        tab:       'erp',
        action:    'Go to ERP tab',
      },
      {
        key:       'x3_soap',
        label:     'Configure X3 Web Services (SOAP)',
        desc:      hasX3
          ? `SOAP URL configured: ${settings.x3_soap_url?.slice(0, 50)}...`
          : 'Add SOAP URL for order creation (required for processing orders)',
        done:      hasX3,
        required:  false,
        tab:       'x3',
        action:    'Go to X3 tab',
      },
      {
        key:       'smtp_config',
        label:     'Configure Email (SMTP)',
        desc:      hasSMTP
          ? `Email server: ${settings.smtp_host}`
          : 'Add SMTP settings for sending emails to users (optional)',
        done:      hasSMTP,
        required:  false,
        tab:       'smtp',
        action:    'Go to SMTP tab',
      },
      {
        key:       'create_admin',
        label:     'Create Admin User',
        desc:      hasAdmin
          ? `Admin: ${adminUser.username}`
          : 'Create the first Administrator user for this tenant',
        done:      hasAdmin,
        required:  true,
        tab:       'users',
        action:    'Go to Users tab',
      },
      {
        key:       'create_users',
        label:     'Create Tenant Users',
        desc:      hasUsers
          ? `${users.length - (hasAdmin ? 1 : 0)} user${users.length > 2 ? 's' : ''} created`
          : 'Create customer, supplier or B2B users using the Add User Wizard',
        done:      hasUsers,
        required:  false,
        tab:       'users',
        action:    'Go to Users tab',
      },
    ];

    const completedRequired = steps.filter(s => s.required && s.done).length;
    const totalRequired     = steps.filter(s => s.required).length;
    const isReady           = completedRequired === totalRequired;
    const progressPct       = Math.round((steps.filter(s => s.done).length / steps.length) * 100);

    res.json({
      success: true,
      data: {
        tenant_id:    id,
        tenant_name:  tenant?.tenant_name,
        is_test:      tenant?.is_test,
        steps,
        is_ready:          isReady,
        completed_required: completedRequired,
        total_required:     totalRequired,
        progress_pct:       progressPct,
        portals:    portalGrants,
        user_count: users.length,
      }
    });
  } catch (err) {
    console.error('SETUP STATUS ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── PORTAL GRANTS ─────────────────────────────────────────────
const PortalGrantModel = require("../models/portalGrant.model");

exports.getPortalGrants = async (req, res) => {
  try {
    const { id: tenantId } = req.params;
    if (req.user.system_role === "partner_user") {
      const ok = await verifyPartnerAccess(req, tenantId);
      if (!ok) return res.status(403).json({ success: false, message: "Access denied" });
    }
    const grants = await PortalGrantModel.getByTenantId(tenantId);
    res.json({ success: true, data: grants });
  } catch (err) {
    console.error("GET PORTAL GRANTS ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.setPortalGrants = async (req, res) => {
  try {
    const { id: tenantId } = req.params;
    const { portal_types } = req.body; // e.g. ['CUSTOMER','CONSIGNMENT']

    if (!Array.isArray(portal_types) || !portal_types.length)
      return res.status(400).json({ success: false, message: "portal_types array required" });

    const validTypes = ["CUSTOMER", "CONSIGNMENT", "SUPPLIER"];
    const invalid = portal_types.filter(p => !validTypes.includes(p));
    if (invalid.length)
      return res.status(400).json({ success: false, message: `Invalid portal types: ${invalid.join(", ")}` });

    if (req.user.system_role === "partner_user") {
      const ok = await verifyPartnerAccess(req, tenantId);
      if (!ok) return res.status(403).json({ success: false, message: "Access denied" });
    }

    // First deactivate all existing grants for this tenant
    await db.query(
      "UPDATE tenant_portal_grants SET is_active = false WHERE tenant_id = $1",
      [tenantId]
    );

    // Grant new portals
    await PortalGrantModel.grantPortals(tenantId, portal_types, req.user.user_id);

    const grants = await PortalGrantModel.getByTenantId(tenantId);
    res.json({ success: true, data: grants });
  } catch (err) {
    console.error("SET PORTAL GRANTS ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── USER ERP MAPPING PER PORTAL ───────────────────────────────
exports.getUserErpMappings = async (req, res) => {
  try {
    const { userId } = req.params;
    const r = await db.query(
      `SELECT * FROM user_role_erp_mapping WHERE user_id = $1 ORDER BY portal_type`,
      [userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.setUserErpMapping = async (req, res) => {
  try {
    const { userId } = req.params;
    const { portal_type, erp_entity_type, erp_entity_code, allowedsite, is_default } = req.body;

    if (!portal_type) return res.status(400).json({ success: false, message: "portal_type required" });

    // If setting as default, clear existing default
    if (is_default) {
      await db.query(
        "UPDATE user_role_erp_mapping SET is_default = false WHERE user_id = $1",
        [userId]
      );
    }

    await db.query(
      `INSERT INTO user_role_erp_mapping
         (user_id, portal_type, erp_entity_type, erp_entity_code, allowedsite, is_default)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, portal_type)
       DO UPDATE SET
         erp_entity_type = EXCLUDED.erp_entity_type,
         erp_entity_code = EXCLUDED.erp_entity_code,
         allowedsite     = EXCLUDED.allowedsite,
         is_default      = EXCLUDED.is_default`,
      [userId, portal_type, erp_entity_type, erp_entity_code, allowedsite, !!is_default]
    );

    const r = await db.query(
      "SELECT * FROM user_role_erp_mapping WHERE user_id=$1 ORDER BY portal_type",
      [userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
