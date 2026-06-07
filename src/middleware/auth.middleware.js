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
              u.is_super_admin, u.tenant_id,
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
    };

    next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
