// src/routes/documents.routes.js

const express  = require("express");
const multer   = require("multer");
const router   = express.Router();
const ctrl     = require("../controllers/documents.controller");
const auth     = require("../middleware/auth.middleware");
const adminMw  = require("../middleware/admin.middleware");

// Multer — memory storage, PDF only, 10 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Only PDF files are accepted"));
  },
});

// ── Template routes ──────────────────────────────────────────────
// GET  /api/admin/legal-documents
router.get(
  "/admin/legal-documents",
  auth, adminMw,
  ctrl.listDocuments
);

// POST /api/admin/legal-documents
router.post(
  "/admin/legal-documents",
  auth, adminMw,
  upload.single("file"),
  ctrl.uploadDocument
);

// PUT  /api/admin/legal-documents/:id
router.put(
  "/admin/legal-documents/:id",
  auth, adminMw,
  ctrl.updateDocument
);

// POST /api/admin/legal-documents/:id/replace
router.post(
  "/admin/legal-documents/:id/replace",
  auth, adminMw,
  upload.single("file"),
  ctrl.replaceDocument
);

// POST /api/admin/legal-documents/:id/archive
router.post(
  "/admin/legal-documents/:id/archive",
  auth, adminMw,
  ctrl.archiveDocument
);

// GET  /api/admin/legal-documents/:id/url
router.get(
  "/admin/legal-documents/:id/url",
  auth, adminMw,
  ctrl.getDocumentUrl
);

// ── Signed document routes ────────────────────────────────────────
// GET  /api/admin/signed-documents
router.get(
  "/admin/signed-documents",
  auth, adminMw,
  ctrl.listSignedDocuments
);

// GET  /api/admin/signed-documents/export.csv
router.get(
  "/admin/signed-documents/export.csv",
  auth, adminMw,
  ctrl.exportSignedDocsCsv
);

// GET  /api/admin/signed-documents/:id/url
router.get(
  "/admin/signed-documents/:id/url",
  auth, adminMw,
  ctrl.getSignedDocumentUrl
);

module.exports = router;