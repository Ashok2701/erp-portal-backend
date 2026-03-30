const service = require("../services/content.service");

exports.createContent = async (req, res) => {
  try {
   
    const body = req.body;


  // 🔥 FIX 1: Parse targets (form-data issue)
    if (body.targets && typeof body.targets === "string") {
      body.targets = JSON.parse(body.targets);
    }


    // 🔥 FILE HANDLING
    if (req.file) {
      body.file_url = req.file.location;
      body.file_name = req.file.originalname;
      body.file_type = req.file.mimetype;
    }

    // 🔥 TARGET FIX
    if (!body.targets) {
      body.targets = [
        { target_type: "ALL", target_value: "ALL" }
      ];
    }
   
   
   console.log("BODY FINAL:", body); // debug
   
    const data = await service.createContent(req.user, body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllContent = async (req, res) => {
  const data = await service.getFeed(req.user);
  res.json({ success: true, data });
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

exports.getContentById = async (req, res) => {
  try {
    const data = await service.getContentById(req.user, req.params.id);

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error("GET CONTENT ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


exports.updateContent = async (req, res) => {
  try {
    const data = await service.updateContent(
      req.user,
      req.params.id,
      req.body
    );

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};