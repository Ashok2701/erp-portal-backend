const express = require("express");
const router = express.Router();
const ModuleController = require("../controllers/module.controller");
const authMiddleware = require("../middleware/auth.middleware");
const adminMiddleware = require("../middleware/admin.middleware");

router.post("/", authMiddleware, ModuleController.createModule);
router.get("/", authMiddleware, ModuleController.getAllModules);
router.put("/:id", authMiddleware, ModuleController.updateModule);
router.delete("/:id", authMiddleware, ModuleController.deleteModule);

// For sidebar (any authenticated user)
router.get("/active/list", authMiddleware, ModuleController.getActiveModules);

module.exports = router;
