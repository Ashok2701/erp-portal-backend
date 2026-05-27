const express = require("express");
const router = express.Router();
const ProfileController = require("../controllers/profile.controller");
const authMiddleware = require("../middleware/auth.middleware");


router.get("/:username", authMiddleware, ProfileController.getProfileDetails);



module.exports = router;
