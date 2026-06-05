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


router.get("/api/documents/:id/download-url", auth, ctrl.getDocumentDownloadUrl);
router.get("/api/documents/:id/signed-url", auth, ctrl.getSignedDocumentUrl);
router.post("/api/documents/:id/sign", auth, ctrl.signDocument);
router.get("/user/signed-documents", auth, ctrl.getSignedDocuments);

module.exports = router;
