const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/content.controller");
const auth = require("../middleware/auth.middleware");

const upload = require("../middleware/uploadSpaces");


router.post("/", auth,upload.single("file"), ctrl.createContent);
router.get("/feed", auth, ctrl.getFeed);
router.post("/:id/view", auth, ctrl.markViewed);
router.post("/:id/sign", auth, ctrl.markSigned);
router.post("/message", auth, ctrl.sendMessage);
router.get("/", auth, ctrl.getFeed);

module.exports = router;