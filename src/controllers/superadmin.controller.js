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

    const { username, email, full_name, password, role_name = 'Customer', portal_mode = 'b2c' } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'username, email and password required' });

    const bcrypt = require('bcrypt');
    const hash   = await bcrypt.hash(password, 10);

    const userResult = await db.query(
      `INSERT INTO users (username, email, full_name, password_hash, is_active, status,
        system_role, portal_mode, tenant_id)
       VALUES ($1,$2,$3,$4,true,'ACTIVE','tenant_user',$5,$6)
       RETURNING user_id, username, email, full_name, is_active, status, created_at`,
      [username, email, full_name, hash, portal_mode, tenantId]
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

    res.status(201).json({ success: true, data: { ...user, role_name } });
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
