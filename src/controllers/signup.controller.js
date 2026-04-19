const service = require("../services/signup.service");

exports.signup = async (req, res) => {
  try {
    const data = await service.signup(req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPendingUsers = async (req, res) => {
  try {
    const data = await service.getPendingUsers(req.query.status || null);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserDetail = async (req, res) => {
  try {
    const data = await service.getUserDetail(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendForVerification = async (req, res) => {
  try {
    const data = await service.sendForVerification(req.user, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error("VERIFICATION ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const data = await service.approveUser(req.user, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const data = await service.rejectUser(req.user, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const data = await service.updateRole(req.user, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getLegalDocuments = async (req, res) => {
  try {
    const data = await service.getLegalDocuments(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitSignatures = async (req, res) => {
  try {
    const data = await service.submitSignatures(req.user, req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error("SIGNATURE ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getLegalTemplates = async (req, res) => {
  try {
    const data = await service.getLegalTemplates();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createLegalTemplate = async (req, res) => {
  try {
    const data = await service.createLegalTemplate(req.user, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
