const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/payment.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, ctrl.getAll);
router.get("/pending-invoices", auth, ctrl.getPendingInvoices);
router.get("/:id", auth, ctrl.getById);

module.exports = router;