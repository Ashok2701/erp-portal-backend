"use strict";
const service = require("../services/dashboard.service");

exports.getAdminStats = async (req, res) => {
  try {
    const data = await service.getAdminStats(req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Admin dashboard error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCustomerStats = async (req, res) => {
  try {
    const result = await service.getCustomerStats(req.user);
    res.json(result);
  } catch (err) {
    console.error("Customer stats error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCustomerDashboard = async (req, res) => {
  try {
    const { username, from, to, preset } = req.query;
    const data = await service.getCustomerDashboard({ username, from, to, preset, user: req.user });
    res.json({ success: true, data });
  } catch (err) {
    console.error("Customer dashboard error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
