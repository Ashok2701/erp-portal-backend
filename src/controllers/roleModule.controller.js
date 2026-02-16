const RoleModuleModel = require("../models/roleModule.model");

exports.getAll = async (req, res) => {
  try {
    const data = await RoleModuleModel.getAllMappings();
    res.json(data);
  } catch (err) {
    console.error("GET ROLE-MODULES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch mappings" });
  }
};

exports.getByRole = async (req, res) => {
  try {
    const { roleId } = req.params;
    const data = await RoleModuleModel.getByRoleId(roleId);
    res.json(data);
  } catch (err) {
    console.error("GET ROLE MODULE BY ROLE ERROR:", err);
    res.status(500).json({ message: "Failed to fetch role modules" });
  }
};

exports.assign = async (req, res) => {
  try {
    await RoleModuleModel.assignModule(req.body);
    res.status(201).json({ message: "Module assigned to role successfully" });
  } catch (err) {
    console.error("ASSIGN MODULE ERROR:", err);
    res.status(500).json({ message: "Failed to assign module" });
  }
};

exports.update = async (req, res) => {
  try {
    await RoleModuleModel.updatePermissions(req.body);
    res.json({ message: "Permissions updated successfully" });
  } catch (err) {
    console.error("UPDATE PERMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to update permissions" });
  }
};

exports.remove = async (req, res) => {
  try {
    const { role_id, module_id } = req.body;
    await RoleModuleModel.removeMapping(role_id, module_id);
    res.json({ message: "Mapping removed successfully" });
  } catch (err) {
    console.error("REMOVE MAPPING ERROR:", err);
    res.status(500).json({ message: "Failed to remove mapping" });
  }
};
