// src/controllers/documents.controller.js

const service = require("../services/documents.service");

// ── Templates ───────────────────────────────────────────────────

exports.listDocuments = async (req, res) => {
  try {
    const includeArchived = req.query.include_archived === "true";
    const data = await service.listDocuments(includeArchived);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    const data = await service.uploadDocument(req.user, req.file, req.body);
    res.json({ success: true, data });
  } catch (err) {
    const status = err.message.includes("required") || err.message.includes("Only PDF") ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.updateDocument = async (req, res) => {
  try {
    const data = await service.updateDocument(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.replaceDocument = async (req, res) => {
  try {
    const data = await service.replaceDocument(req.params.id, req.user, req.file);
    res.json({ success: true, data });
  } catch (err) {
    const status = err.message.includes("required") || err.message.includes("Only PDF") ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.archiveDocument = async (req, res) => {
  try {
    const data = await service.archiveDocument(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDocumentUrl = async (req, res) => {
  try {
    const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";
    const data = await service.getPresignedUrl(req.params.id, disposition);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Signed Documents ─────────────────────────────────────────────

exports.listSignedDocuments = async (req, res) => {
  try {
    const data = await service.listSignedDocuments(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSignedDocumentUrl = async (req, res) => {
  try {
    const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";
    const data = await service.getSignedDocPresignedUrl(req.params.id, disposition);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportSignedDocsCsv = async (req, res) => {
  try {
    const csv = await service.buildCsvExport(req.query);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="signed-documents.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};