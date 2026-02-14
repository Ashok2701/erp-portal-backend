const RoleModel = require("../models/role.model");

module.exports = async (req, res, next) => {
  try {
    const { user_id } = req.user;

    const roles = await RoleModel.getRolesByUserId(user_id);

    if (!roles.includes("ADMIN")) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    next();
  } catch (err) {
    console.error("ADMIN MIDDLEWARE ERROR:", err);
    return res.status(500).json({ message: "Authorization failed" });
  }
};
