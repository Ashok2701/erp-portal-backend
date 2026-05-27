const service = require("../services/profile.service");

exports.getProfileDetails = async (req, res) => {
  try {
    const data = await service.getContentById(req.user, req.params.username);

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
