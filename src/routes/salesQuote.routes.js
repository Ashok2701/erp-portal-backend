const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/salesQuote.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, ctrl.getAll);
router.get("/:id", auth, ctrl.getById);

module.exports = router;