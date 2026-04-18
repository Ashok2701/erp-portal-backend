const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/salesRequest.controller");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, ctrl.createSalesRequest);
router.get("/", auth, ctrl.getAllSalesRequest);
router.post("/generate-order", auth, ctrl.generateOrder);
router.get("/:id", auth, ctrl.getSalesRequestById);

router.put("/:id", auth, ctrl.updateSalesRequest);
router.delete("/:id", auth, ctrl.removeSalesRequest);

module.exports = router;