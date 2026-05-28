const service = require("../services/profile.service");

exports.getProfileDetails = async (req, res) => {
  try {
    const data = await service.getContentById(req.user, req.query.username);

     console.log("----#####-----")
     console.log("AT profile")
     console.log(req.query.username)
     console.log(req.params.username)
     console.log("----####------")
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
