const service = require("../services/salesRequest.service");

exports.createSalesRequest = async (req, res) => {
  try {
    const data = await service.create(req.user, req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error("CREATE SR ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllSalesRequest = async (req, res) => {
  const data = await service.getAll(req.user);
  res.json({ success: true, data });
};

exports.getSalesRequestById = async (req, res) => {
  const data = await service.getById(req.params.id);
  res.json({ success: true, data });
};

exports.updateSalesRequest = async (req, res) => {
  const data = await service.update(req.params.id, req.body);
  res.json({ success: true, data });
};

exports.removeSalesRequest = async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true });
};