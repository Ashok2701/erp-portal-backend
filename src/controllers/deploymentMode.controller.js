"use strict";
const modeConfig = require("../config/mode");

// GET /admin/deployment-mode — anyone can read (needed by frontend on load)
exports.getMode = async (req, res) => {
  try {
    const mode = await modeConfig.getDeploymentMode();
    res.json({ success: true, data: { mode } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /admin/deployment-mode — owner only
exports.setMode = async (req, res) => {
  try {
    if (req.user.system_role !== "owner" && !req.user.is_super_admin) {
      return res.status(403).json({ success: false, message: "Owner access required" });
    }
    const { mode } = req.body;
    if (!mode) return res.status(400).json({ success: false, message: "mode required" });

    await modeConfig.setDeploymentMode(mode);
    res.json({
      success: true,
      data: { mode },
      message: `Deployment mode switched to ${mode === "onpremise" ? "On-Premise" : "SaaS"}`,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
