const RoleModel = require("../models/role.model");

exports.isAdmin = async (req, res, next) => {
  try {
    const { user_id } = req.user;

    const roles = await RoleModel.getRolesByUserId(user_id);

    // Extract role names
    const roleNames = roles.map(r => r.role_name);

    // Check admin role (case-insensitive safe)
    const isAdmin = roleNames.some(
      role =>
        role.toUpperCase() === "ADMIN" ||
        role.toUpperCase() === "ADMINISTRATOR"
    );

    if (!isAdmin) {
      return res.status(403).json({
        message: "Access denied. Admin only."
      });
    }

    next();
  } catch (err) {
    console.error("ADMIN MIDDLEWARE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
