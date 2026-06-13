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

exports.getStockRequests = async (req, res) => {
  try {
    const db = require("../config/db");
    const userId = req.user?.user_id;

    const result = await db.query(
      `SELECT
         sr.drop_request_id    AS id,
         sr.drop_request_id    AS ref,
         sr.status,
         sr.total_amount,
         sr.total_qty,
         sr.request_date,
         sr.created_time,
         sr.erp_order_no,
         sr.comment            AS notes,
         u.username            AS requested_by,
         u.full_name,
         u.allowedsite         AS site,
         u.erp_entity_code     AS customer_code,
         (SELECT COUNT(*)   FROM sales_request_items sri WHERE sri.drop_request_id=sr.drop_request_id) AS item_count,
         (SELECT sri.product_code FROM sales_request_items sri WHERE sri.drop_request_id=sr.drop_request_id ORDER BY sri.id LIMIT 1) AS first_product_code,
         (SELECT sri.prod_desc   FROM sales_request_items sri WHERE sri.drop_request_id=sr.drop_request_id ORDER BY sri.id LIMIT 1) AS first_product_name,
         (SELECT SUM(sri.quantity) FROM sales_request_items sri WHERE sri.drop_request_id=sr.drop_request_id) AS total_items_qty
       FROM sales_requests sr
       JOIN users u ON u.user_id = sr.user_id
       WHERE sr.user_id = $1
       ORDER BY sr.created_time DESC
       LIMIT 100`,
      [userId]
    );

    const rows = result.rows.map(r => ({
      id:            r.id,
      ref:           r.ref,
      status:        mapStatus(r.status),
      priority:      "NORMAL",
      total_amount:  Number(r.total_amount || 0),
      total_qty:     Number(r.total_qty || r.total_items_qty || 0),
      qty:           Number(r.total_qty || r.total_items_qty || 0),
      item_count:    Number(r.item_count || 0),
      product_code:  r.first_product_code || "",
      product_name:  r.first_product_name || (r.item_count > 1 ? `${r.item_count} products` : ""),
      product_codes: r.first_product_code || "",
      from_location: r.site || "",
      to_location:   "",
      site:          r.site || "",
      customer_code: r.customer_code || "",
      requested_by:  r.full_name || r.requested_by,
      customer_name: r.full_name || "",
      requested_on:  r.request_date || r.created_time,
      request_date:  r.request_date || r.created_time,
      needed_by:     null,
      erp_order_no:  r.erp_order_no || null,
      note:          r.notes || "",
      uom:           "Units",
    }));

    // Enrich with address data from X3 (zip, city, site_desc)
    try {
      const ERPFactory = require('../erp/erp.factory');
      const adapter = await ERPFactory.getERPAdapterForUser(req.user);
      // Get unique customer codes
      const codes = [...new Set(rows.map(r => r.customer_code).filter(Boolean))];
      const addrMap = {};
      for (const code of codes) {
        const addrs = await adapter.getCustomerAddresses(code).catch(() => []);
        const addr = addrs.find(a => a.address_code === 'AD1') || addrs[0];
        if (addr) addrMap[code] = addr;
      }
      // Get site descriptions
      const sites = await adapter.getAllSites().catch(() => []);
      const siteMap = {};
      sites.forEach(s => { siteMap[s.SITE] = s.DESCR; });
      // Merge into rows
      rows.forEach(r => {
        const addr = addrMap[r.customer_code];
        if (addr) {
          r.del_zip  = addr.POSCOD_0 || addr.postal_code || '';
          r.del_city = addr.city || addr.CTY_0 || '';
        }
        if (r.site && siteMap[r.site]) r.site_desc = siteMap[r.site];
      });
    } catch (e) { /* non-critical — skip enrichment */ }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getStockRequests:", err.message);
    res.json({ success: true, data: [] });
  }
};

function mapStatus(s) {
  const map = {
    "CREATED":             "PENDING",
    "Processing":          "APPROVED",
    "Order Generated":     "APPROVED",
    "Delivery Scheduled":  "IN_TRANSIT",
    "Completed":           "COMPLETED",
    "REJECTED":            "REJECTED",
  };
  return map[s] || "PENDING";
}

exports.getMovements = async (req, res) => {
  try {
    const filters = {
      product:  req.query.product  || null,
      location: req.query.location || null,
      site:     req.query.site     || null,
    };
    const data = await inventoryService.getMovements(req.user, filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error("MOVEMENTS ERROR:", err.message);
    res.json({ success: true, data: [], warning: err.message });
  }
};

exports.getNetwork = async (req, res) => {
  try {
    const data = await inventoryService.getNetwork(req.user);
    res.json({ success: true, data });
  } catch (err) {
    console.error("NETWORK ERROR:", err.message);
    res.json({ success: true, data: { own_location: '', own_stock: [], other_locations: [], total_sites: 0 } });
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
