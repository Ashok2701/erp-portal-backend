const service = require("../services/dashboard.service");

exports.getAdminStats = async (req, res) => {
  try {
    const data = await service.getAdminStats(req.user);

    res.json({ success: true, data });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.getCustomerDashboard = async (req, res) => {

  try {

    const {
      username,
      from,
      to,
      preset
    } = req.query;

    const data =
      await service.getCustomerDashboard({
        username,
        from,
        to,
        preset,
        user: req.user
      });

    res.json({
      success: true,
      data
    });

  } catch (err) {

    console.error("CUSTOMER DASHBOARD ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};