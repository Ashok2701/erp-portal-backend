"use strict";
const express      = require("express");
const router       = express.Router();
const ctrl         = require("../controllers/superadmin.controller");
const auth         = require("../middleware/auth.middleware");
const superadminMw = require("../middleware/superadmin.middleware");

// All routes require auth + superadmin
router.use(auth, superadminMw);

router.get  ("/tenants",                    ctrl.listTenants);
router.post ("/tenants",                    ctrl.createTenant);
router.get  ("/tenants/:id",                ctrl.getTenant);
router.put  ("/tenants/:id",                ctrl.updateTenant);
router.post ("/tenants/:id/settings",       ctrl.upsertSettings);
router.get  ("/tenants/:id/users",          ctrl.getTenantUsers);
router.post ("/tenants/:id/assign-admin",   ctrl.assignAdmin);
router.post ("/tenants/:id/test-connection",ctrl.testConnection);

module.exports = router;
