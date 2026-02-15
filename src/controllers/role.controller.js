const RoleModel = require("../models/role.model");

exports.createRole = async (req, res) => {
  try {
    const { role_code, role_name } = req.body;

    if (!role_code || !role_name) {
      return res.status(400).json({
        message: "role_code and role_name are required"
      });
    }

    const role = await RoleModel.createRole(req.body);
    res.status(201).json(role);

  } catch (err) {
    console.error("CREATE ROLE ERROR:", err);

    if (err.code === "23505") {
      return res.status(400).json({
        message: "Role code already exists"
      });
    }

    res.status(500).json({ message: "Failed to create role" });
  }
};

exports.getAllRoles = async (req, res) => {
  try {
    const roles = await RoleModel.getAllRoles();
    res.json(roles);
  } catch (err) {
    console.error("GET ROLES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch roles" });
  }
};

exports.getActiveRoles = async (req, res) => {
  try {
    const roles = await RoleModel.getActiveRoles();
    res.json(roles);
  } catch (err) {
    console.error("GET ACTIVE ROLES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch roles" });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await RoleModel.updateRole(id, req.body);

    res.json(updated);
  } catch (err) {
    console.error("UPDATE ROLE ERROR:", err);
    res.status(500).json({ message: "Failed to update role" });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    await RoleModel.softDeleteRole(id);

    res.json({ message: "Role deactivated successfully" });
  } catch (err) {
    console.error("DELETE ROLE ERROR:", err);
    res.status(500).json({ message: "Failed to deactivate role" });
  }
};
