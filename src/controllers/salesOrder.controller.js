const service = require("../services/salesOrder.service");

exports.getAll = async (req, res) => {
  try {
    
    const data = await service.getAll(req);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await service.getById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET ORDER DETAIL ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};