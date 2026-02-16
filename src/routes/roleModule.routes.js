const express = require("express");
const router = express.Router();

const RoleModuleController = require("../controllers/roleModule.controller");
const authMiddleware = require("../middleware/auth.middleware");
const adminMiddleware = require("../middleware/admin.middleware");

// Admin only routes

router.get("/", authMiddleware, RoleModuleController.getAll);

router.get("/:roleId", authMiddleware, RoleModuleController.getByRole);

router.post("/", authMiddleware, RoleModuleController.assign);

router.put("/", authMiddleware, RoleModuleController.update);

router.delete("/", authMiddleware, RoleModuleController.remove);

module.exports = router;
