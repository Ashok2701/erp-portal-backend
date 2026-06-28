const pool = require("../config/db");

module.exports = (requiredRole) => {
  return async (req, res, next) => {
    const { user_id, system_role, is_super_admin } = req.user;

    // Owner and super_admin bypass all RBAC checks
    if (system_role === "owner" || is_super_admin) {
      return next();
    }

    const result = await pool.query(
      `SELECT r.role_code
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.role_id
       WHERE ur.user_id = $1`,
      [user_id]
    );

    const roles = result.rows.map(r => r.role_code);

    if (!roles.includes(requiredRole)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};
