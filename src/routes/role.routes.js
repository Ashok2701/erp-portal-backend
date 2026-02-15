const express = require("express");
const router = express.Router();
const RoleController = require("../controllers/role.controller");
const authMiddleware = require("../middleware/auth.middleware");
const adminMiddleware = require("../middleware/admin.middleware");

router.post("/", authMiddleware, RoleController.createRole);
router.get("/", authMiddleware, RoleController.getAllRoles);
router.put("/:id", authMiddleware, RoleController.updateRole);
router.delete("/:id", authMiddleware, RoleController.deleteRole);

// Active roles for dropdown (any logged user)
router.get("/active/list", authMiddleware, RoleController.getActiveRoles);

module.exports = router;
