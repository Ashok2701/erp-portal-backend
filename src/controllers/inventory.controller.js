"use strict";
const inventoryService = require("../services/inventory.service");

exports.getInventory = async (req, res) => {
  try {
    // /inventory/availability → default view=available
    const pathDefault = req.path === '/availability' ? 'available' : 'consignment';
    const view = req.query.view || pathDefault;
    const data = await inventoryService.getInventory(req.user, view, req.query);
    res.json({ success: true, data });
  } catch (err) {
    console.error("INVENTORY ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getInventorySummary = async (req, res) => {
  try {
    const data = await inventoryService.getSummary(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
