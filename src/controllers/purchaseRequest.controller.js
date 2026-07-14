"use strict";
const service = require("../services/purchaseRequest.service");

exports.create = async (req, res) => {
  try {
    const result = await service.create(req.user, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error("CREATE PR ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const data = await service.getAll(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const pr = await service.getById(req.params.id, req.user);
    if (!pr) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: pr });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["APPROVED","REJECTED","PENDING"].includes(status))
      return res.status(400).json({ success: false, message: "Invalid status" });
    await service.updateStatus(req.params.id, req.user.tenant_id, status);
    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.convertToPO = async (req, res) => {
  try {
    const { request_ids } = req.body;
    if (!request_ids?.length)
      return res.status(400).json({ success: false, message: "request_ids array required" });
    const results = await service.convertToPO(req.user, request_ids);
    res.json({ success: true, data: results });
  } catch (err) {
    if (err.code === "ERP_NOT_CONFIGURED")
      return res.status(503).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await require("../config/db").query(
      "DELETE FROM purchase_request_items WHERE purchase_request_id=$1",
      [req.params.id]
    );
    await require("../config/db").query(
      "DELETE FROM purchase_requests WHERE purchase_request_id=$1 AND tenant_id=$2 AND status='PENDING'",
      [req.params.id, req.user.tenant_id]
    );
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
