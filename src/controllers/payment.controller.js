const service = require("../services/payment.service");

exports.getAll = async (req, res) => {
  try {
    const data = await service.getAll(req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET PAYMENTS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const data = await service.getById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET PAYMENT DETAIL ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPendingInvoices = async (req, res) => {
  try {
    const data = await service.getPendingInvoices(req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET PENDING INVOICES ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};