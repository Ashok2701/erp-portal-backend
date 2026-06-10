const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/dashboard.controller");
const auth = require("../middleware/auth.middleware");

router.get("/admin/stats", auth, ctrl.getAdminStats);
router.get("/stats",       auth, ctrl.getCustomerStats); // customer dashboard stats

// CUSTOMER DASHBOARD
router.get(
  "/customer",
  auth,
  ctrl.getCustomerDashboard
);


module.exports = router;