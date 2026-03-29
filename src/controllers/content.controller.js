const service = require("../services/content.service");

exports.createContent = async (req, res) => {
  try {
    const data = await service.createContent(req.user, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.getFeed = async (req, res) => {
  const data = await service.getFeed(req.user);
  res.json({ success: true, data });
};

exports.markViewed = async (req, res) => {
  await service.markViewed(req.user.id, req.params.id);
  res.json({ success: true });
};

exports.markSigned = async (req, res) => {
  await service.markSigned(req.user.id, req.params.id);
  res.json({ success: true });
};

exports.sendMessage = async (req, res) => {
  const data = await service.sendMessage(req.user, req.body);
  res.json({ success: true, data });
};