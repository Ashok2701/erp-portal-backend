"use strict";
const db = require("../config/db");
const TenantSettingsModel = require("../models/tenantSettings.model");
const ERPFactory = require("../erp/erp.factory");

// ── LIST ALL PARTNERS (owner only) ───────────────────────────
exports.listPartners = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM tenants t WHERE t.partner_id = p.partner_id) AS tenant_count,
        (SELECT COUNT(*) FROM tenants t WHERE t.partner_id = p.partner_id AND t.is_test = false AND t.is_active = true) AS active_tenant_count,
        (SELECT COUNT(*) FROM tenants t WHERE t.partner_id = p.partner_id AND t.is_test = true) AS test_tenant_count,
        (SELECT COUNT(*) FROM partner_users pu WHERE pu.partner_id = p.partner_id) AS user_count
      FROM partners p
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("LIST PARTNERS ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ONE PARTNER ──────────────────────────────────────────
exports.getPartner = async (req, res) => {
  try {
    const { id } = req.params;

    // Partner users can only see their own partner
    if (req.user.system_role === "partner_user" && req.user.partner_id !== id)
      return res.status(403).json({ success: false, message: "Access denied" });

    const result = await db.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tenants t WHERE t.partner_id = p.partner_id) AS tenant_count,
        (SELECT COUNT(*) FROM partner_users pu WHERE pu.partner_id = p.partner_id) AS user_count
       FROM partners p WHERE p.partner_id = $1`,
      [id]
    );

    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Partner not found" });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("GET PARTNER ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CREATE PARTNER (owner only) ──────────────────────────────
exports.createPartner = async (req, res) => {
  try {
    const {
      partner_name, slug, email, phone,
      plan = "starter", max_tenants = 10,
      logo_url, app_name, primary_color,
      default_currency = "USD", default_language = "en",
      default_unit = "GAL", custom_domain
    } = req.body;

    if (!partner_name || !slug)
      return res.status(400).json({ success: false, message: "partner_name and slug are required" });

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

    const result = await db.query(
      `INSERT INTO partners (
        partner_name, slug, email, phone, plan, max_tenants,
        logo_url, app_name, primary_color,
        default_currency, default_language, default_unit,
        custom_domain, approved_by, approved_at, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),true)
      RETURNING *`,
      [
        partner_name, cleanSlug, email, phone, plan, max_tenants,
        logo_url, app_name, primary_color,
        default_currency, default_language, default_unit,
        custom_domain, req.user.user_id
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ success: false, message: "Slug already exists" });
    console.error("CREATE PARTNER ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE PARTNER ───────────────────────────────────────────
exports.updatePartner = async (req, res) => {
  try {
    const { id } = req.params;

    // Partner users can only update their own partner
    if (req.user.system_role === "partner_user" && req.user.partner_id !== id)
      return res.status(403).json({ success: false, message: "Access denied" });

    const {
      partner_name, email, phone, plan, max_tenants,
      logo_url, app_name, primary_color,
      default_currency, default_language, default_unit,
      custom_domain, is_active
    } = req.body;

    const result = await db.query(
      `UPDATE partners SET
        partner_name     = COALESCE($1,  partner_name),
        email            = COALESCE($2,  email),
        phone            = COALESCE($3,  phone),
        plan             = COALESCE($4,  plan),
        max_tenants      = COALESCE($5,  max_tenants),
        logo_url         = COALESCE($6,  logo_url),
        app_name         = COALESCE($7,  app_name),
        primary_color    = COALESCE($8,  primary_color),
        default_currency = COALESCE($9,  default_currency),
        default_language = COALESCE($10, default_language),
        default_unit     = COALESCE($11, default_unit),
        custom_domain    = COALESCE($12, custom_domain),
        is_active        = COALESCE($13, is_active),
        updated_at       = NOW()
       WHERE partner_id = $14
       RETURNING *`,
      [
        partner_name, email, phone, plan, max_tenants,
        logo_url, app_name, primary_color,
        default_currency, default_language, default_unit,
        custom_domain, is_active, id
      ]
    );

    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Partner not found" });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("UPDATE PARTNER ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── LIST TENANTS FOR A PARTNER ───────────────────────────────
exports.getPartnerTenants = async (req, res) => {
  try {
    const { id } = req.params;

    // Partner users can only see their own tenants
    if (req.user.system_role === "partner_user" && req.user.partner_id !== id)
      return res.status(403).json({ success: false, message: "Access denied" });

    const result = await db.query(
      `SELECT t.*,
         ts.erp_system, ts.erp_db_host, ts.smtp_host,
         ts.app_name, ts.logo_url, ts.default_currency, ts.default_language,
         (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.tenant_id) AS user_count
       FROM tenants t
       LEFT JOIN tenant_settings ts ON ts.tenant_id = t.tenant_id
       WHERE t.partner_id = $1
       ORDER BY t.created_at DESC`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GET PARTNER TENANTS ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CREATE TENANT UNDER PARTNER ──────────────────────────────
exports.createTenantUnderPartner = async (req, res) => {
  try {
    const { id } = req.params; // partner_id

    // Partner users can only create under their own partner
    if (req.user.system_role === "partner_user" && req.user.partner_id !== id)
      return res.status(403).json({ success: false, message: "Access denied" });

    const { name, slug, plan = "starter", is_test = false, test_note } = req.body;
    if (!name || !slug)
      return res.status(400).json({ success: false, message: "name and slug are required" });

    // Check partner's tenant quota
    const partner = await db.query(
      `SELECT max_tenants,
         (SELECT COUNT(*) FROM tenants WHERE partner_id = $1 AND is_test = false) AS current_count
       FROM partners WHERE partner_id = $1`,
      [id]
    );

    if (!partner.rows.length)
      return res.status(404).json({ success: false, message: "Partner not found" });

    const { max_tenants, current_count } = partner.rows[0];
    if (!is_test && parseInt(current_count) >= parseInt(max_tenants))
      return res.status(400).json({
        success: false,
        message: `Partner tenant quota reached (${max_tenants} tenants)`
      });

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

    const result = await db.query(
      `INSERT INTO tenants (tenant_name, slug, plan, partner_id, is_test, test_note, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,NOW()) RETURNING *`,
      [name, cleanSlug, plan, id, is_test, test_note]
    );

    const tenant = result.rows[0];

    // Create default empty settings row
    await db.query(
      `INSERT INTO tenant_settings (tenant_id, spaces_folder)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [tenant.tenant_id, cleanSlug]
    );

    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ success: false, message: "Slug already exists" });
    console.error("CREATE TENANT UNDER PARTNER ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── LIST PARTNER USERS ───────────────────────────────────────
exports.getPartnerUsers = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.system_role === "partner_user" && req.user.partner_id !== id)
      return res.status(403).json({ success: false, message: "Access denied" });

    const result = await db.query(
      `SELECT u.user_id, u.username, u.email, u.full_name,
              u.is_active, u.created_at, pu.role, pu.id AS partner_user_id
       FROM partner_users pu
       JOIN users u ON u.user_id = pu.user_id
       WHERE pu.partner_id = $1
       ORDER BY u.created_at DESC`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GET PARTNER USERS ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ADD USER TO PARTNER ──────────────────────────────────────
exports.addPartnerUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, role = "admin" } = req.body;

    if (!user_id)
      return res.status(400).json({ success: false, message: "user_id is required" });

    // Update user system_role
    await db.query(
      `UPDATE users SET system_role = 'partner_user' WHERE user_id = $1`,
      [user_id]
    );

    const result = await db.query(
      `INSERT INTO partner_users (partner_id, user_id, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (partner_id, user_id) DO UPDATE SET role = $3, is_active = true
       RETURNING *`,
      [id, user_id, role]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("ADD PARTNER USER ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET BRANDING CONFIG (public — called by frontend on load) ─
exports.getBrandingConfig = async (req, res) => {
  try {
    const host = req.headers.host || "";
    const slug = host.split(".")[0].toLowerCase();

    // Check if it's a partner slug
    const partnerResult = await db.query(
      `SELECT partner_name, slug, logo_url, app_name, primary_color,
              default_currency, default_language, default_unit
       FROM partners
       WHERE slug = $1 AND is_active = true`,
      [slug]
    );

    if (partnerResult.rows.length) {
      return res.json({
        success: true,
        type: "partner",
        branding: partnerResult.rows[0]
      });
    }

    // Check if it's a tenant slug
    const tenantResult = await db.query(
      `SELECT t.tenant_name, t.slug,
              ts.logo_url, ts.app_name, ts.primary_color,
              ts.default_currency, ts.default_language, ts.default_unit,
              p.logo_url AS partner_logo_url, p.app_name AS partner_app_name,
              p.primary_color AS partner_primary_color,
              p.default_currency AS partner_currency,
              p.default_language AS partner_language,
              p.default_unit AS partner_unit
       FROM tenants t
       LEFT JOIN tenant_settings ts ON ts.tenant_id = t.tenant_id
       LEFT JOIN partners p ON p.partner_id = t.partner_id
       WHERE t.slug = $1 AND t.is_active = true`,
      [slug]
    );

    if (tenantResult.rows.length) {
      const row = tenantResult.rows[0];
      // Tenant branding overrides partner branding
      return res.json({
        success: true,
        type: "tenant",
        branding: {
          app_name:         row.app_name         || row.partner_app_name         || "Self Order Portal",
          logo_url:         row.logo_url         || row.partner_logo_url         || null,
          primary_color:    row.primary_color    || row.partner_primary_color    || "#2563EB",
          default_currency: row.default_currency || row.partner_currency         || "USD",
          default_language: row.default_language || row.partner_language         || "en",
          default_unit:     row.default_unit     || row.partner_unit             || "GAL",
        }
      });
    }

    // Default owner branding
    res.json({
      success: true,
      type: "owner",
      branding: {
        app_name:         "Self Order Portal",
        logo_url:         null,
        primary_color:    "#2563EB",
        default_currency: "USD",
        default_language: "en",
        default_unit:     "GAL",
      }
    });
  } catch (err) {
    console.error("GET BRANDING CONFIG ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── LIST ALL OWNERS ──────────────────────────────────────────
exports.listOwners = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT user_id, username, email, full_name,
             is_active, system_role, created_at, status
      FROM users
      WHERE system_role = 'owner' OR is_super_admin = true
      ORDER BY created_at ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('LIST OWNERS ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CREATE OWNER ─────────────────────────────────────────────
exports.createOwner = async (req, res) => {
  try {
    const { username, email, full_name, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'username, email and password are required' });

    const bcrypt = require('bcrypt');
    const password_hash = await bcrypt.hash(password, 10);

    const result = await db.query(`
      INSERT INTO users (
        username, email, full_name, password_hash,
        is_active, status, system_role, portal_mode,
        is_super_admin, tenant_id
      ) VALUES ($1,$2,$3,$4,true,'ACTIVE','owner','both',true,NULL)
      RETURNING user_id, username, email, full_name, is_active, created_at
    `, [username, email, full_name, password_hash]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ success: false, message: 'Username or email already exists' });
    console.error('CREATE OWNER ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── TOGGLE OWNER STATUS ──────────────────────────────────────
exports.toggleOwnerStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;

    // Cannot deactivate yourself
    if (userId === req.user.user_id)
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });

    const result = await db.query(`
      UPDATE users SET is_active = $1
      WHERE user_id = $2 AND (system_role = 'owner' OR is_super_admin = true)
      RETURNING user_id, username, is_active
    `, [is_active, userId]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Owner not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('TOGGLE OWNER ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── OWNER DASHBOARD STATS ────────────────────────────────────
exports.getOwnerDashboardStats = async (req, res) => {
  try {
    const [
      partnerStats,
      tenantStats,
      userStats,
      recentTenants,
      recentPartners,
      planBreakdown,
      tenantGrowth,
    ] = await Promise.all([

      // Partner stats
      db.query(`
        SELECT
          COUNT(*)                                          AS total_partners,
          COUNT(*) FILTER (WHERE is_active = true)         AS active_partners,
          COUNT(*) FILTER (WHERE is_active = false)        AS inactive_partners,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month
        FROM partners
      `),

      // Tenant stats
      db.query(`
        SELECT
          COUNT(*)                                                AS total_tenants,
          COUNT(*) FILTER (WHERE is_active = true AND is_test = false)  AS active_tenants,
          COUNT(*) FILTER (WHERE is_test = true)                 AS test_tenants,
          COUNT(*) FILTER (WHERE partner_id IS NULL)             AS direct_tenants,
          COUNT(*) FILTER (WHERE partner_id IS NOT NULL)         AS partner_tenants,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month
        FROM tenants
      `),

      // User stats across all tenants
      db.query(`
        SELECT
          COUNT(*)                                              AS total_users,
          COUNT(*) FILTER (WHERE is_active = true)             AS active_users,
          COUNT(*) FILTER (WHERE status = 'ACTIVE')            AS verified_users,
          COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')    AS pending_review,
          COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL')  AS pending_approval,
          COUNT(*) FILTER (WHERE status = 'IN_VERIFICATION')   AS in_verification,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month
        FROM users
        WHERE system_role = 'tenant_user' AND tenant_id IS NOT NULL
      `),

      // Recent tenants (last 5)
      db.query(`
        SELECT t.tenant_id, t.tenant_name, t.slug, t.plan,
               t.is_active, t.is_test, t.created_at,
               p.partner_name,
               (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.tenant_id) AS user_count,
               ts.erp_system, ts.erp_db_host
        FROM tenants t
        LEFT JOIN partners p ON p.partner_id = t.partner_id
        LEFT JOIN tenant_settings ts ON ts.tenant_id = t.tenant_id
        ORDER BY t.created_at DESC LIMIT 5
      `),

      // Recent partners (last 5)
      db.query(`
        SELECT p.partner_id, p.partner_name, p.slug, p.plan,
               p.is_active, p.created_at, p.email,
               COUNT(t.tenant_id) AS tenant_count
        FROM partners p
        LEFT JOIN tenants t ON t.partner_id = p.partner_id
        GROUP BY p.partner_id
        ORDER BY p.created_at DESC LIMIT 5
      `),

      // Tenant plan breakdown
      db.query(`
        SELECT plan, COUNT(*) AS count
        FROM tenants
        WHERE is_test = false
        GROUP BY plan
        ORDER BY count DESC
      `),

      // Tenant growth last 6 months
      db.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
          DATE_TRUNC('month', created_at) AS month_date,
          COUNT(*) AS count
        FROM tenants
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month_date ASC
      `),
    ]);

    res.json({
      success: true,
      data: {
        partners:       partnerStats.rows[0],
        tenants:        tenantStats.rows[0],
        users:          userStats.rows[0],
        recentTenants:  recentTenants.rows,
        recentPartners: recentPartners.rows,
        planBreakdown:  planBreakdown.rows,
        tenantGrowth:   tenantGrowth.rows,
      }
    });
  } catch (err) {
    console.error('OWNER DASHBOARD STATS ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PARTNER: CREATE USER FOR A PARTNER ───────────────────────
// Owner creates a staff member for a partner
exports.createPartnerUser = async (req, res) => {
  try {
    const { id: partnerId } = req.params;
    const { username, email, full_name, password, role = 'admin' } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'username, email and password are required' });

    // Check partner exists
    const partner = await db.query('SELECT partner_id, partner_name FROM partners WHERE partner_id=$1', [partnerId]);
    if (!partner.rows.length)
      return res.status(404).json({ success: false, message: 'Partner not found' });

    const bcrypt = require('bcrypt');
    const password_hash = await bcrypt.hash(password, 10);

    // Create user with partner_user system_role and no tenant_id
    const userResult = await db.query(
      `INSERT INTO users (
        username, email, full_name, password_hash,
        is_active, status, system_role, portal_mode, tenant_id
      ) VALUES ($1,$2,$3,$4,true,'ACTIVE','partner_user','both',NULL)
      RETURNING user_id, username, email, full_name, is_active, created_at`,
      [username, email, full_name, password_hash]
    );
    const user = userResult.rows[0];

    // Link user to partner
    await db.query(
      `INSERT INTO partner_users (partner_id, user_id, role, is_active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (partner_id, user_id) DO UPDATE SET role=$3, is_active=true`,
      [partnerId, user.user_id, role]
    );

    res.status(201).json({ success: true, data: { ...user, partner_name: partner.rows[0].partner_name, role } });
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ success: false, message: 'Username or email already exists' });
    console.error('CREATE PARTNER USER ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PARTNER: TOGGLE USER STATUS ───────────────────────────────
exports.togglePartnerUserStatus = async (req, res) => {
  try {
    const { id: partnerId, userId } = req.params;
    const { is_active } = req.body;

    // Owner can toggle any partner's user; partner can only toggle their own
    if (req.user.system_role === 'partner_user' && req.user.partner_id !== partnerId)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const result = await db.query(
      `UPDATE users SET is_active=$1 WHERE user_id=$2 RETURNING user_id, username, is_active`,
      [is_active, userId]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('TOGGLE PARTNER USER ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PARTNER: CREATE FIRST ADMIN USER IN A TENANT ─────────────
exports.createTenantAdminUser = async (req, res) => {
  try {
    const { id: partnerId, tenantId } = req.params;
    const { username, email, full_name, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'username, email and password are required' });

    // Verify partner owns this tenant
    const tenant = await db.query(
      `SELECT tenant_id, tenant_name FROM tenants WHERE tenant_id=$1 AND partner_id=$2`,
      [tenantId, partnerId]
    );
    if (!tenant.rows.length)
      return res.status(404).json({ success: false, message: 'Tenant not found or not under this partner' });

    // Get Administrator role for this tenant
    const roleResult = await db.query(
      `SELECT role_id FROM roles WHERE tenant_id=$1 AND role_name='Administrator' LIMIT 1`,
      [tenantId]
    );
    if (!roleResult.rows.length)
      return res.status(400).json({ success: false, message: 'Administrator role not found for this tenant. Configure tenant first.' });

    const bcrypt = require('bcrypt');
    const password_hash = await bcrypt.hash(password, 10);

    // Create admin user for the tenant
    const userResult = await db.query(
      `INSERT INTO users (
        username, email, full_name, password_hash,
        is_active, status, system_role, portal_mode, tenant_id, is_super_admin
      ) VALUES ($1,$2,$3,$4,true,'ACTIVE','tenant_user','b2b',$5,false)
      RETURNING user_id, username, email, full_name, is_active, created_at`,
      [username, email, full_name, password_hash, tenantId]
    );
    const user = userResult.rows[0];

    // Assign Administrator role
    await db.query(
      `INSERT INTO user_roles (user_role_id, user_id, role_id)
       VALUES (gen_random_uuid(),$1,$2)
       ON CONFLICT DO NOTHING`,
      [user.user_id, roleResult.rows[0].role_id]
    );

    res.status(201).json({
      success: true,
      data: { ...user, role: 'Administrator', tenant_name: tenant.rows[0].tenant_name }
    });
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ success: false, message: 'Username or email already exists' });
    console.error('CREATE TENANT ADMIN ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PARTNER: GET PARTNER PROFILE ──────────────────────────────
exports.getPartnerProfile = async (req, res) => {
  try {
    const { system_role, partner_id: userPartnerId } = req.user;
    const { id } = req.params;

    // Partner can only see their own profile
    if (system_role === 'partner_user' && userPartnerId !== id)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const result = await db.query(
      `SELECT p.*,
         (SELECT COUNT(*) FROM tenants t WHERE t.partner_id = p.partner_id AND t.is_test=false) AS active_tenant_count,
         (SELECT COUNT(*) FROM tenants t WHERE t.partner_id = p.partner_id AND t.is_test=true)  AS test_tenant_count,
         (SELECT COUNT(*) FROM partner_users pu WHERE pu.partner_id = p.partner_id)              AS user_count
       FROM partners p WHERE p.partner_id=$1`, [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Partner not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET PARTNER PROFILE ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PARTNER: UPDATE OWN BRANDING/SETTINGS ────────────────────
exports.updatePartnerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { system_role, partner_id: userPartnerId } = req.user;

    if (system_role === 'partner_user' && userPartnerId !== id)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const {
      partner_name, email, phone,
      logo_url, app_name, primary_color,
      default_currency, default_language, default_unit
    } = req.body;

    const result = await db.query(
      `UPDATE partners SET
        partner_name     = COALESCE($1,  partner_name),
        email            = COALESCE($2,  email),
        phone            = COALESCE($3,  phone),
        logo_url         = COALESCE($4,  logo_url),
        app_name         = COALESCE($5,  app_name),
        primary_color    = COALESCE($6,  primary_color),
        default_currency = COALESCE($7,  default_currency),
        default_language = COALESCE($8,  default_language),
        default_unit     = COALESCE($9,  default_unit),
        updated_at       = NOW()
       WHERE partner_id=$10 RETURNING *`,
      [partner_name, email, phone, logo_url, app_name, primary_color,
       default_currency, default_language, default_unit, id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Partner not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('UPDATE PARTNER PROFILE ERROR:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
