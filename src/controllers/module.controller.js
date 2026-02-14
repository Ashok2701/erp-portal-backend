const ModuleModel = require("../models/module.model");

exports.createModule = async (req, res) => {
  try {
    const {
      module_code,
      module_name,
      module_type,
      route_path,
      icon_name
    } = req.body;

    if (!module_code || !module_name || !module_type) {
      return res.status(400).json({
        message: "module_code, module_name and module_type are required"
      });
    }

    const module = await ModuleModel.createModule(req.body);
    res.status(201).json(module);

  } catch (err) {
    console.error("CREATE MODULE ERROR:", err);

    if (err.code === "23505") {
      return res.status(400).json({ message: "Module code already exists" });
    }

    res.status(500).json({ message: "Failed to create module" });
  }
};

exports.getAllModules = async (req, res) => {
  try {
    const modules = await ModuleModel.getActiveModules();
    res.json(modules);
  } catch (err) {
    console.error("GET MODULES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch modules" });
  }
};

exports.updateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await ModuleModel.updateModule(id, req.body);
    res.json(updated);
  } catch (err) {
    console.error("UPDATE MODULE ERROR:", err);
    res.status(500).json({ message: "Failed to update module" });
  }
};

exports.deleteModule = async (req, res) => {
  try {
    const { id } = req.params;

    await ModuleModel.softDeleteModule(id);

    res.json({ message: "Module deactivated successfully" });
  } catch (err) {
    console.error("DELETE MODULE ERROR:", err);
    res.status(500).json({ message: "Failed to deactivate module" });
  }
};

exports.getActiveModules = async (req, res) => {
  try {
    const modules = await ModuleModel.getActiveModules();
    res.json(modules);
  } catch (err) {
    console.error("GET ACTIVE MODULES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch modules" });
  }
};
