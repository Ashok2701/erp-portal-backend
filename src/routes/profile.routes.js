const express = require("express");
const router = express.Router();
const ProfileController = require("../controllers/profile.controller");
const authMiddleware = require("../middleware/auth.middleware");


router.get("/", authMiddleware, ProfileController.getProfileDetails);
router.put('/', authMiddleware, ProfileController.updateProfile);


module.exports = router;
