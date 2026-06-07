const service = require("../services/content.service");

exports.createContent = async (req, res) => {
  try {
    const body = req.body;

    // Parse targets if sent as JSON string (multipart/form-data)
    if (body.targets && typeof body.targets === "string") {
      body.targets = JSON.parse(body.targets);
    }

    // File from multer-s3
    if (req.file) {
      body.file_url  = req.file.location;
      body.file_name = req.file.originalname;
      body.file_type = req.file.mimetype;
    }

    if (!body.targets) {
      body.targets = [{ target_type: "ALL", target_value: "ALL" }];
    }

    const data = await service.createContent(req.user, body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllContent = async (req, res) => {
  try {
    const data = await service.getFeed(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getFeed = async (req, res) => {
  try {
    const data = await service.getFeed(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ★ FIX: pass req.user (object) not req.user.id
// auth middleware sets req.user.id = decoded.user_id, but service now handles both
exports.markViewed = async (req, res) => {
  try {
    await service.markViewed(req.user, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ★ FIX: pass req.user (object) not req.user.id
exports.markSigned = async (req, res) => {
  try {
    await service.markSigned(req.user, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const data = await service.sendMessage(req.user, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getContentById = async (req, res) => {
  try {
    const data = await service.getContentById(req.user, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET CONTENT ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateContent = async (req, res) => {
  try {
    const data = await service.updateContent(req.user, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAcknowledgements = async (req, res) => {
  try {
    const data = await service.getAcknowledgements(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSentContent = async (req, res) => {
  try {
    const data = await service.getSentContent(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
