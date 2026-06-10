"use strict";
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/maintenance.controller");
const auth    = require("../middleware/auth.middleware");
const rbacMiddleware = require("../middleware/rbac.middleware");

// Customer — get active maintenance (any logged-in user)
router.get("/",                      auth, ctrl.getActive);

// Admin — full CRUD
router.get("/admin",                 auth, rbacMiddleware("ADMIN"), ctrl.list);
router.post("/admin",                auth, rbacMiddleware("ADMIN"), ctrl.create);
router.put("/admin/:id",             auth, rbacMiddleware("ADMIN"), ctrl.update);
router.delete("/admin/:id",          auth, rbacMiddleware("ADMIN"), ctrl.remove);

module.exports = router;
