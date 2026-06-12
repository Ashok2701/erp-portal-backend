"use strict";
// ============================================================
// inventory.service.js
// ALL ERP data goes through ERPFactory → SageX3Adapter (or future adapters)
// Postgres (db) is only used to resolve user context (site, entity code)
// ============================================================

const ERPFactory  = require("../erp/erp.factory");
const UserModel   = require("../models/user.model");

// ── resolve user's site + customer code from Postgres ────────
async function resolveUserContext(user) {
  const userId  = user.user_id || user.id;
  const userInfo = await UserModel.getUserById(userId);
  const u        = userInfo[0] || {};
  return {
    user_id:      userId,
    user_id_str:  String(userId),
    site:         u.allowedsite        || null,
    customerCode: u.erp_entity_code    || null,
    entityType:   u.erp_entity_type    || "customer",
    role:         user.role            || "Customer",
  };
}

// ── main dispatcher ──────────────────────────────────────────
exports.getInventory = async (user, view, filters = {}) => {
  const ctx     = await resolveUserContext(user);
  const adapter = await ERPFactory.getERPAdapterForUser(user);

  switch (view) {
    case "consignment":  return getConsignment(adapter, ctx, filters);
    case "available":    return getAvailable(adapter, ctx, filters);
    case "in-transit":   return getInTransit(adapter, ctx, filters);
    case "reserved":     return getReserved(adapter, ctx, filters);
    case "projected":    return getProjected(adapter, ctx, filters);
    default:             return getConsignment(adapter, ctx, filters);
  }
};

// ── summary counts for overview dashboard ─────────────────────
exports.getSummary = async (user) => {
  const db      = require("../config/db");
  const ctx     = await resolveUserContext(user);
  const adapter = await ERPFactory.getERPAdapterForUser(user);

  // Load all stock from ERP
  const stock = await adapter.getStock({ site: ctx.site }).catch(() => []);

  // KPI aggregates
  const available   = stock.reduce((s, r) => s + (Number(r.AVAILABLE_QTY) || 0), 0);
  const consignment = stock.reduce((s, r) => s + (Number(r.PHYSICAL_QTY)  || 0), 0);
  const reserved    = stock.reduce((s, r) => s + (Number(r.ALLOCATED_QTY) || 0), 0);

  // In-transit — count from open deliveries
  const deliveries   = await adapter.getAllDeliveries({ user: ctx }).catch(() => []);
  const inTransitQty = deliveries.reduce((s, d) =>
    s + (d.items || []).reduce((ss, i) => ss + (Number(i.QTY_0 || i.qty) || 0), 0), 0);

  // Projected = available + in-transit
  const projected = available + inTransitQty;

  // Pending requests from Postgres
  const pendingRes = await db.query(
    "SELECT COUNT(*) FROM sales_requests WHERE status = 'CREATED' AND user_id = $1",
    [ctx.user_id]
  ).catch(() => ({ rows: [{ count: 0 }] }));
  const pendingRequests = Number(pendingRes.rows[0]?.count || 0);

  // by_type — pie chart data
  const by_type = [
    { type: "consignment", qty: consignment },
    { type: "available",   qty: available   },
    { type: "reserved",    qty: reserved    },
    { type: "in_transit",  qty: inTransitQty},
    { type: "projected",   qty: projected   },
  ].filter(t => t.qty > 0);

  // by_location — bar chart: group stock by LOCATION field
  const locationMap = {};
  for (const r of stock) {
    const loc = r.LOCATION || r.SITE || "Unknown";
    locationMap[loc] = (locationMap[loc] || 0) + (Number(r.PHYSICAL_QTY) || 0);
  }
  const by_location = Object.entries(locationMap)
    .map(([location, qty]) => ({ location, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // upcoming — line chart: group in-transit by expected date
  const dateMap = {};
  for (const d of deliveries) {
    const date = d.DLVDAT_0
      ? new Date(d.DLVDAT_0).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "TBD";
    const qty = (d.items || []).reduce((s, i) => s + (Number(i.QTY_0 || i.qty) || 0), 0);
    dateMap[date] = (dateMap[date] || 0) + qty;
  }
  const upcoming = Object.entries(dateMap)
    .map(([date, qty]) => ({ date, qty, source: "In Transit" }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10);

  return {
    kpis: {
      available,
      consignment,
      reserved,
      in_transit:       inTransitQty,
      projected,
      network:          0,   // not yet available from X3
      pending_requests: pendingRequests,
    },
    by_type,
    by_location,
    upcoming,
  };
};

// ================================================================
// CONSIGNMENT — physical stock at user's site
// Uses adapter.getStock() → LEWISB.XSTDALN_STOCK (SQL Server / X3)
// ================================================================
async function getConsignment(adapter, ctx, filters) {
  // Filter stock by customer's erp_entity_code as LOCATION + their allowed site
  const stock = await adapter.getStock({
    site:         ctx.site,
    product:      filters.search   || null,
    category:     filters.category || null,
    warehouse:    ctx.customerCode || null,  // LOCATION = erp_entity_code
  });

  return stock.map(r => ({
    product_code:  r.PRODUCT,
    product_desc:  r.PROD_DESC,
    description:   r.PROD_DESC,
    site:          r.SITE,
    location:      r.LOCATION,
    physical_qty:  Number(r.PHYSICAL_QTY)  || 0,
    allocated_qty: Number(r.ALLOCATED_QTY) || 0,
    consumed_qty:  Number(r.ALLOCATED_QTY) || 0,
    available_qty: Number(r.AVAILABLE_QTY) || 0,
    unit:          r.UNIT,
    uom:           r.UNIT,
    category:      r.CATEGORY,
    order_qty:     0,
    status: (() => {
      const avail = Number(r.AVAILABLE_QTY) || 0;
      const phys  = Number(r.PHYSICAL_QTY)  || 0;
      if (phys === 0)   return 'Empty';
      if (avail <= 0)   return 'Out';
      if (avail < phys * 0.2) return 'Low';
      return 'Active';
    })(),
  }));
}

// ── In-Transit Inventory ─────────────────────────────────────
async function getInTransit(adapter, ctx, filters) {
  const customerCode = ctx.customerCode;
  const site = ctx.site;
  const sites = site ? [site] : [];

  const rows = await adapter.getInTransitStock(customerCode, sites);

  const s = (filters.search || '').toLowerCase();

  return rows
    .filter(r => !s ||
      (r.PRODUCT || '').toLowerCase().includes(s) ||
      (r.PROD_DESC || '').toLowerCase().includes(s) ||
      (r.DELIVERY_NO || '').toLowerCase().includes(s))
    .map(r => ({
      id:              `${r.DELIVERY_NO}-${r.PRODUCT}`,
      product_code:    r.PRODUCT,
      product_desc:    r.PROD_DESC,
      description:     r.PROD_DESC,
      site:            r.SITE,
      delivery_no:     r.DELIVERY_NO,
      sales_order_no:  r.SALES_ORDER_NO,
      expected_date:   r.EXPECTED_DATE,
      qty:             Number(r.QTY) || 0,
      quantity:        Number(r.QTY) || 0,
      unit:            r.UNIT,
      uom:             r.UNIT,
      customer_code:   r.CUSTOMER_CODE,
      customer_name:   r.CUSTOMER_NAME,
      status:          'In Transit',
    }));
}

// ── Stock Movements drill-down ─────────────────────────────────
exports.getMovements = async (user, filters) => {
  const ctx     = await resolveUserContext(user);
  const adapter = await ERPFactory.getERPAdapterForUser(user);

  const movements = await adapter.getStockMovements({
    site:     filters.site     || ctx.site,
    product:  filters.product  || null,
    location: filters.location || null,
  });

  return movements;
};

// ── Network Inventory — stock across all sites ─────────────────
exports.getNetwork = async (user) => {
  const ctx     = await resolveUserContext(user);
  const adapter = await ERPFactory.getERPAdapterForUser(user);

  // Get stock for user's own site
  const ownStock = await adapter.getStock({ site: ctx.site }).catch(() => []);

  // Get all available sites
  let allSites = [];
  try {
    allSites = await adapter.getAllSites();
  } catch (_) {}

  // Get stock for other sites (excluding user's own)
  const otherSites = allSites.filter(s => s.SITE !== ctx.site && s.SITE);
  const otherLocations = [];

  for (const site of otherSites.slice(0, 5)) { // limit to 5 other sites
    try {
      const siteStock = await adapter.getStock({ site: site.SITE });
      if (siteStock.length > 0) {
        otherLocations.push({
          id:       site.SITE,
          location: site.DESCR || site.SITE,
          contact:  `stock@${site.SITE.toLowerCase()}.com`,
          items: siteStock
            .filter(r => Number(r.AVAILABLE_QTY) > 0)
            .slice(0, 20)
            .map(r => ({
              product_code:  r.PRODUCT,
              product_name:  r.PROD_DESC,
              available_qty: Number(r.AVAILABLE_QTY) || 0,
              physical_qty:  Number(r.PHYSICAL_QTY)  || 0,
              uom:           r.UNIT || 'EA',
              location:      r.LOCATION || site.SITE,
              permission:    'REQUEST_ONLY',
            })),
        });
      }
    } catch (_) {}
  }

  return {
    own_location: ctx.site,
    own_stock: ownStock
      .filter(r => Number(r.PHYSICAL_QTY) > 0)
      .slice(0, 20)
      .map(r => ({
        product_code: r.PRODUCT,
        product_name: r.PROD_DESC,
        qty:          Number(r.PHYSICAL_QTY) || 0,
        available:    Number(r.AVAILABLE_QTY) || 0,
        uom:          r.UNIT || 'EA',
      })),
    other_locations: otherLocations,
    total_sites: allSites.length,
  };
};
