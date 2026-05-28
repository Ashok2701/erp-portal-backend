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
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


// ======================================
// UPDATE PROFILE
// ======================================

exports.updateProfile = async (req, res) => {

  try {

    const data = await service.updateProfile(
      req.user,
      req.query.username,
      req.body
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      data
    });

  } catch (err) {

    console.error("UPDATE PROFILE ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
