"use strict";
const express      = require("express");
const router       = express.Router();
const ctrl         = require("../controllers/superadmin.controller");
const auth         = require("../middleware/auth.middleware");
const superadminMw = require("../middleware/superadmin.middleware");

const { validate, schemas } = require("../middleware/validation.middleware");
// All routes require auth + superadmin
router.use(auth, superadminMw);

router.get  ("/tenants",                    ctrl.listTenants);
router.post ("/tenants",                    validate(schemas.createTenant), ctrl.createTenant);
router.get  ("/tenants/:id",                ctrl.getTenant);
router.put  ("/tenants/:id",                ctrl.updateTenant);
router.post ("/tenants/:id/settings",       validate(schemas.upsertTenantSettings), ctrl.upsertSettings);
router.get  ("/tenants/:id/users",          ctrl.getTenantUsers);
router.post ("/tenants/:id/assign-admin",   ctrl.assignAdmin);
router.post ("/tenants/:id/test-connection",ctrl.testConnection);

router.post ("/tenants/:id/users",          validate(schemas.createUser), ctrl.createTenantUser);
router.put  ("/tenants/:id/users/:userId",   ctrl.toggleTenantUser);
router.put  ("/tenants/users/:userId",        ctrl.toggleTenantUser);
router.post ("/users/:userId/reset-password", ctrl.resetTenantUserPassword);

router.get  ("/tenants/:id/portal-grants",       ctrl.getPortalGrants);
router.get  ("/users/:userId/erp-mappings",      ctrl.getUserErpMappings);
router.post ("/users/:userId/erp-mappings",      ctrl.setUserErpMapping);
router.post ("/tenants/:id/portal-grants",   ctrl.setPortalGrants);

module.exports = router;
