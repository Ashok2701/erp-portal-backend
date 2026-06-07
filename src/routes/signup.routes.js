const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/signup.controller");
const auth    = require("../middleware/auth.middleware");
const adminMw = require("../middleware/admin.middleware");

// ── Public ───────────────────────────────────────────────────────
router.post("/auth/signup", ctrl.signup);

// ── Admin — User Approvals ───────────────────────────────────────
router.get ("/admin/pending-users",               auth, adminMw, ctrl.getPendingUsers);
router.get ("/admin/pending-users/:id",           auth, adminMw, ctrl.getUserDetail);
router.put ("/admin/users/:id/send-verification", auth, adminMw, ctrl.sendForVerification);
router.put ("/admin/users/:id/approve",           auth, adminMw, ctrl.approveUser);
router.put ("/admin/users/:id/reject",            auth, adminMw, ctrl.rejectUser);
router.put ("/admin/users/:id/update-role",       auth, adminMw, ctrl.updateRole);

// ── Admin — Legal Templates ──────────────────────────────────────
router.get ("/admin/legal-templates",             auth, adminMw, ctrl.getLegalTemplates);
router.post("/admin/legal-templates",             auth, adminMw, ctrl.createLegalTemplate);

// ── User — Legal Documents & Signing ────────────────────────────
router.get ("/user/legal-documents",              auth, ctrl.getLegalDocuments);
router.post("/user/submit-signatures",            auth, ctrl.submitSignatures);

// ── Document signing flow (new per-document approach) ───────────
router.get ("/api/documents/:id/download-url",   auth, ctrl.getDocumentDownloadUrl);
router.post("/api/documents/:id/sign",            auth, ctrl.signDocument);
router.get ("/api/documents/:id/signed-url",      auth, ctrl.getSignedDocumentUrl);
router.get ("/user/signed-documents",             auth, ctrl.getSignedDocuments);

module.exports = router;
