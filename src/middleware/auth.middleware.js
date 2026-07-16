"use strict";
const jwt = require("jsonwebtoken");
const db  = require("../config/db");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Authorization header missing" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userResult = await db.query(
      `SELECT u.user_id, u.username, u.status, u.portal_mode,
              u.is_super_admin, u.system_role, u.tenant_id,
              u.erp_entity_type, u.erp_entity_code, u.allowedsite,
              r.role_name,
              t.slug AS tenant_slug
       FROM users u
       LEFT JOIN user_roles ur ON u.user_id = ur.user_id
       LEFT JOIN roles r  ON ur.role_id = r.role_id
       LEFT JOIN tenants t ON u.tenant_id = t.tenant_id
       WHERE u.user_id = $1 LIMIT 1`,
      [decoded.user_id]
    );

    const row = userResult.rows[0] || {};

    // Resolve system_role — owner check via is_super_admin for backward compat
    const system_role = row.system_role ||
      (row.is_super_admin ? "owner" : "tenant_user");

    // ── Portal-scoped ERP context ──────────────────────────────
    // A multi-portal tenant user can have a DIFFERENT erp_entity_code per
    // portal (user_role_erp_mapping) — e.g. a customer code for CUSTOMER/
    // CONSIGNMENT and a supplier code for SUPPLIER. This middleware used to
    // never set erp_entity_type/code/allowedsite on req.user at all, so
    // every ERP-scoped query (erp.controller.js reads req.user.erp_entity_code
    // to filter orders/invoices/etc. to the logged-in customer) always got
    // undefined and silently returned unfiltered data for every customer.
    // The frontend sends the active portal on every request via
    // X-Active-Portal; look up that portal's mapping here. Falls back to
    // the legacy single-portal columns on `users` for owner/partner/
    // pre-multi-portal accounts.
    let erp_entity_type = row.erp_entity_type || null;
    let erp_entity_code = row.erp_entity_code || null;
    let allowedsite      = row.allowedsite      || null;

    if (system_role === "tenant_user" && row.tenant_id) {
      const activePortal = req.headers["x-active-portal"] || null;
      const mapResult = await db.query(
        activePortal
          ? `SELECT erp_entity_type, erp_entity_code, allowedsite
             FROM user_role_erp_mapping WHERE user_id = $1 AND portal_type = $2 LIMIT 1`
          : `SELECT erp_entity_type, erp_entity_code, allowedsite
             FROM user_role_erp_mapping WHERE user_id = $1 AND is_default = true LIMIT 1`,
        activePortal ? [decoded.user_id, activePortal] : [decoded.user_id]
      );
      if (mapResult.rows.length) {
        erp_entity_type = mapResult.rows[0].erp_entity_type || erp_entity_type;
        erp_entity_code = mapResult.rows[0].erp_entity_code || erp_entity_code;
        allowedsite      = mapResult.rows[0].allowedsite      || allowedsite;
      }
    }

    req.user = {
      id:             decoded.user_id,
      user_id:        decoded.user_id,
      username:       row.username       || decoded.username || "",
      tenant_id:      row.tenant_id      || decoded.tenant_id,
      tenant_slug:    row.tenant_slug    || "temaglobal",
      role:           row.role_name      || decoded.role || "Customer",
      status:         row.status         || "ACTIVE",
      portal_mode:    row.portal_mode    || "b2c",
      is_super_admin: row.is_super_admin || false,
      system_role,
      erp_entity_type,
      erp_entity_code,
      erp_customer_code: erp_entity_type === "customer" ? erp_entity_code : null,
      erp_supplier_code: erp_entity_type === "supplier" ? erp_entity_code : null,
      allowedsite,
    };

    next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
