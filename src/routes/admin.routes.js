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

router.get(
  "/users/check-username/:username",
  authMiddleware,
  rbacMiddleware("ADMIN"),
  adminController.checkUsername
);

router.put(
  "/users/:userId/erp-map",
  authMiddleware,
  rbacMiddleware("ADMIN"),
  adminController.mapUserToErp
);



router.get("/users/:id", adminMiddleware,rbacMiddleware("ADMIN"), adminController.getUserById);

router.put("/users/:id", adminMiddleware,rbacMiddleware("ADMIN"), adminController.updateUser);

router.delete("/users/:id", adminMiddleware,rbacMiddleware("ADMIN"), adminController.deleteUser);

module.exports = router;
