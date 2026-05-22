const service = require("../services/salesDeliveries.service");

exports.getAll = async (req, res) => {
  try {
    
    const data = await service.getAll(req);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET DELIVERIES ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await service.getById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET DELIVERY DETAIL ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};