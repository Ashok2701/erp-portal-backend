"use strict";
const db = require("../config/db");

// Middleware: allows only partner_user or owner system roles
module.exports.partnerOnly = async (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ message: "Unauthorized" });

  const { system_role } = req.user;

  if (system_role !== "partner_user" && system_role !== "owner")
    return res.status(403).json({ message: "Partner access required" });

  next();
};

// Middleware: allows only owner system role
module.exports.ownerOnly = (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ message: "Unauthorized" });

  if (req.user.system_role !== "owner")
    return res.status(403).json({ message: "Owner access required" });

  next();
};

// Middleware: injects partner_id scope into req
// Owner sees all (no filter), partner sees only their tenants
module.exports.injectPartnerScope = async (req, res, next) => {
  try {
    if (!req.user)
      return res.status(401).json({ message: "Unauthorized" });

    const { system_role, user_id } = req.user;

    if (system_role === "owner") {
      req.partnerScope = null; // owner sees everything
      return next();
    }

    if (system_role === "partner_user") {
      const result = await db.query(
        `SELECT partner_id FROM partner_users
         WHERE user_id = $1 AND is_active = true LIMIT 1`,
        [user_id]
      );

      if (!result.rows.length)
        return res.status(403).json({ message: "No active partner association found" });

      req.partnerScope = result.rows[0].partner_id;
      req.user.partner_id = result.rows[0].partner_id;
      return next();
    }

    return res.status(403).json({ message: "Access denied" });
  } catch (err) {
    console.error("PARTNER SCOPE MIDDLEWARE ERROR:", err.message);
    return res.status(500).json({ message: "Authorization error" });
  }
};
