"use strict";
const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth.middleware");
const ERPFactory = require("../erp/erp.factory");

router.get("/", auth, async (req, res) => {
  try {
    const adapter = await ERPFactory.getERPAdapterForUser(req.user);
    const data    = await adapter.getAllCreditNotes(req).catch(() => []);
    res.json({ success: true, data });
  } catch (err) {
    console.error("credit-notes:", err.message);
    res.json({ success: true, data: [] });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    const adapter = await ERPFactory.getERPAdapterForUser(req.user);
    const all     = await adapter.getAllCreditNotes(req).catch(() => []);
    const note    = all.find(n => n.credit_note_number === req.params.id);
    if (!note) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: { header: note, items: [] } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
