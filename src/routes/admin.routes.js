const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const authMiddleware = require("../middleware/auth.middleware");
const rbacMiddleware = require("../middleware/rbac.middleware");

router.post(
  "/users",
  authMiddleware,
  rbacMiddleware("ADMIN"),
  adminController.createUser
);

router.get(
  "/users",
  authMiddleware,
  rbacMiddleware("ADMIN"),
  adminController.listUsers
);

router.put(
  "/users/:userId/erp-map",
  authMiddleware,
  rbacMiddleware("ADMIN"),
  adminController.mapUserToErp
);

module.exports = router;
