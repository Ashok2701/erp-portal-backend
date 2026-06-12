"use strict";
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/inventory.controller");
const auth    = require("../middleware/auth.middleware");

// GET /inventory?view=consignment|available|in-transit|reserved|projected
// Optional filters: ?search=xxx&category=xxx
router.get("/",            auth, ctrl.getInventory);
router.get("/summary",     auth, ctrl.getInventorySummary);
router.get("/overview",    auth, ctrl.getInventorySummary);  // alias
router.get("/network",     auth, ctrl.getNetwork);               // cross-site stock
router.get("/availability",auth, ctrl.getInventory);         // alias → ?view=available
router.get("/movements",   auth, ctrl.getMovements);          // stock transaction movements
router.get("/requests",    auth, ctrl.getStockRequests);     // sales_requests for logged-in user

module.exports = router;
