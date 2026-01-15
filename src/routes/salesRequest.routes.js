const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const salesRequestController = require("../controllers/salesRequest.controller");

router.post(
  "/",
  authMiddleware,
  salesRequestController.createSalesRequest
);

router.get(
  "/",
  authMiddleware,
  salesRequestController.listSalesRequests
);

router.get(
  "/:id",
  authMiddleware,
  salesRequestController.getSalesRequestDetails
);

module.exports = router;
