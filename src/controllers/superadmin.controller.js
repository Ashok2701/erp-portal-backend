"use strict";
const db                  = require("../config/db");
const TenantSettingsModel = require("../models/tenantSettings.model");
const ERPFactory          = require("../erp/erp.factory");
const emailService        = require("../services/email.service");

// ── LIST ALL TENANTS ─────────────────────────────────────────
exports.listTenants = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.tenant_id) AS user_count,
        ts.erp_system, ts.erp_db_host, ts.erp_db_name,
        ts.smtp_host, ts.x3_soap_url, ts.spaces_folder
      FROM tenants t
      LEFT JOIN tenant_settings ts ON ts.tenant_id = t.tenant_id
      ORDER BY t.created_at ASC`);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET ONE TENANT ───────────────────────────────────────────
exports.getTenant = async (req, res) => {
  try {
    const { id } = req.params;
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
    const { name, slug, plan = "starter" } = req.body;
    if (!name || !slug) return res.status(400).json({ success: false, message: "name and slug are required" });

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

    const result = await db.query(
      `INSERT INTO tenants (tenant_name, slug, plan, is_active, created_at)
       VALUES ($1,$2,$3,true,NOW()) RETURNING *`,
      [name, cleanSlug, plan]
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
    const settings = await TenantSettingsModel.getTenantSettings(id);
    ERPFactory.clearAdapterCache(id);
    const adapter = await ERPFactory.getERPAdapterForUser({ tenant_id: id });
    const sites = await adapter.getAllSites().catch(() => []);
    res.json({ success: true, message: "ERP connection successful", sites_count: sites.length });
  } catch (err) {
    res.status(500).json({ success: false, message: `Connection failed: ${err.message}` });
  }
};
