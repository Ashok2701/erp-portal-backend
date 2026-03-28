const service = require("../services/dashboard.service");

exports.getAdminStats = async (req, res) => {
  try {
    const data = await service.getAdminStats();

    res.json({ success: true, data });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};