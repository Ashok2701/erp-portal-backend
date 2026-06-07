"use strict";
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/inventory.controller");
const auth    = require("../middleware/auth.middleware");

// GET /inventory?view=consignment|available|in-transit|reserved|projected
// Optional filters: ?search=xxx&category=xxx
router.get("/",         auth, ctrl.getInventory);
router.get("/summary",  auth, ctrl.getInventorySummary);

module.exports = router;
