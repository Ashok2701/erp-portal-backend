const RoleModel = require("../models/role.model");

module.exports = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { user_id } = req.user;

    const roles = await RoleModel.getRolesByUserId(user_id);

    if (!roles || roles.length === 0) {
      return res.status(403).json({
        message: "No roles assigned."
      });
    }

    const isAdmin = roles.some(role =>
      role.role_name &&
      (
        role.role_name.toUpperCase() === "ADMIN" ||
        role.role_name.toUpperCase() === "ADMINISTRATOR"
      )
    );

    if (!isAdmin) {
      return res.status(403).json({
        message: "Access denied. Admin only."
      });
    }

    next();
  } catch (err) {
    console.error("ADMIN MIDDLEWARE ERROR:", err);
    return res.status(500).json({ message: "Authorization failed" });
  }
};
