"use strict";
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/purchaseRequest.controller");
const auth    = require("../middleware/auth.middleware");

router.get  ("/",                    auth, ctrl.getAll);
router.post ("/",                    auth, ctrl.create);
router.get  ("/:id",                 auth, ctrl.getById);
router.patch("/:id/status",          auth, ctrl.updateStatus);
router.post ("/convert-to-po",       auth, ctrl.convertToPO);
router.delete("/:id",                auth, ctrl.remove);

module.exports = router;
