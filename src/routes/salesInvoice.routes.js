const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/salesInvoice.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, ctrl.getAll);
router.get("/pending", auth, ctrl.getPending);
router.get("/:id", auth, ctrl.getById);

module.exports = router;