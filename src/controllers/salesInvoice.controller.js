const service = require("../services/salesInvoice.service");

exports.getAll = async (req, res) => {
  try {
    const data = await service.getAll(req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET INVOICES ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await service.getById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET INVOICE DETAIL ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPending = async (req, res) => {
  try {
    const data = await service.getPending(req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET PENDING INVOICES ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};