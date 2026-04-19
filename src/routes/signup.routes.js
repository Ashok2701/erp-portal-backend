const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/signup.controller");
const auth = require("../middleware/auth.middleware");

// Public
router.post("/auth/signup", ctrl.signup);

// Admin - User Approvals
router.get("/admin/pending-users", auth, ctrl.getPendingUsers);
router.get("/admin/pending-users/:id", auth, ctrl.getUserDetail);
router.put("/admin/users/:id/send-verification", auth, ctrl.sendForVerification);
router.put("/admin/users/:id/approve", auth, ctrl.approveUser);
router.put("/admin/users/:id/reject", auth, ctrl.rejectUser);
router.put("/admin/users/:id/update-role", auth, ctrl.updateRole);

// User - Legal Documents
router.get("/user/legal-documents", auth, ctrl.getLegalDocuments);
router.post("/user/submit-signatures", auth, ctrl.submitSignatures);

// Admin - Legal Templates
router.get("/admin/legal-templates", auth, ctrl.getLegalTemplates);
router.post("/admin/legal-templates", auth, ctrl.createLegalTemplate);

module.exports = router;
