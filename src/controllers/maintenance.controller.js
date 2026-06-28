"use strict";
const service = require("../services/maintenance.service");

// Customer — get active plan
exports.getActive = async (req, res) => {
  try {
    const plan     = await service.getActivePlan(req.user.tenant_id);
    const upcoming = await service.getUpcomingPlans(req.user.tenant_id);
    res.json({ success: true, data: { active: plan, upcoming } });
  } catch (err) {
    console.error("maintenance.getActive:", err.message);
    res.json({ success: true, data: { active: null, upcoming: [] } });
  }
};

// Admin — list all (owner sees all tenants, admin sees own tenant)
exports.list = async (req, res) => {
  try {
    const { tenant_id, system_role } = req.user;
    // Owner has no tenant_id — list all plans across all tenants
    const plans = (system_role === "owner" || !tenant_id)
      ? await service.listAllPlans()
      : await service.listPlans(tenant_id);
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin — create
exports.create = async (req, res) => {
  try {
    if (!req.body.title || !req.body.message || !req.body.start_date || !req.body.end_date)
      return res.status(400).json({ success: false, message: "title, message, start_date and end_date are required" });
    // Owner must specify tenant_id in body, admin uses their own
    const tenantId = req.user.tenant_id || req.body.tenant_id;
    const plan = await service.createPlan(tenantId, req.user.user_id, req.body);
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin — update
exports.update = async (req, res) => {
  try {
    const plan = await service.updatePlan(req.user.tenant_id, req.params.id, req.body);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin — delete
exports.remove = async (req, res) => {
  try {
    await service.deletePlan(req.user.tenant_id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
