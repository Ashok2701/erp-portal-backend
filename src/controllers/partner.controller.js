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
        (SELECT COUNT(*) FROM tenants t WHERE t.partner_id = p.partner_id AND t.is_test = false) AS active_tenant_count,
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
