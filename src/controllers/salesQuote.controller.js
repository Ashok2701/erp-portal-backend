const service = require("../services/salesQuote.service");

exports.getAll = async (req, res) => {
  try {
    const data = await service.getAll(req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET QUOTES ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await service.getById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET QUOTE DETAIL ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};