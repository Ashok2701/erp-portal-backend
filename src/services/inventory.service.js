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
  const stock = await adapter.getStock({
    site:     ctx.site,
    product:  filters.search   || null,
    category: filters.category || null,
  });

  // Normalise column names + add computed status + allow order qty
  return stock.map(r => ({
    product_code:  r.PRODUCT,
    product_desc:  r.PROD_DESC,
    description:   r.PROD_DESC,   // alias — frontend normalize uses 'description'
    site:          r.SITE,
    location:      r.LOCATION,
    physical_qty:  Number(r.PHYSICAL_QTY)   || 0,
    allocated_qty: Number(r.ALLOCATED_QTY)  || 0,
    consumed_qty:  Number(r.ALLOCATED_QTY)  || 0,   // alias — frontend uses 'consumed_qty'
    available_qty: Number(r.AVAILABLE_QTY)  || 0,
    unit:          r.UNIT,
    uom:           r.UNIT,   // alias — frontend uses 'uom'
    category:      r.CATEGORY,
    order_qty:     0,   // editable field — frontend default, submitted via cart
    status: (() => {
      const avail = Number(r.AVAILABLE_QTY) || 0;
      const phys  = Number(r.PHYSICAL_QTY)  || 0;
      if (avail <= 0) return "Out of Stock";
      if (phys > 0 && (avail / phys) < 0.2) return "Low";
      return "Active";
    })(),
  }));
}

// ================================================================
// AVAILABLE — stock available across all sites (read-only view)
// ================================================================
async function getAvailable(adapter, ctx, filters) {
  const stock = await adapter.getStock({
    site:     ctx.site,
    product:  filters.search   || null,
    category: filters.category || null,
  });

  return stock
    .filter(r => Number(r.AVAILABLE_QTY) > 0)
    .map(r => ({
      // Standard fields
      product_code:    r.PRODUCT,
      product_name:    r.PROD_DESC,
      description:     r.PROD_DESC,
      product_desc:    r.PROD_DESC,
      site:            r.SITE,
      location:        r.LOCATION || r.SITE || "",
      available_qty:   Number(r.AVAILABLE_QTY) || 0,
      physical_qty:    Number(r.PHYSICAL_QTY)  || 0,
      allocated_qty:   Number(r.ALLOCATED_QTY) || 0,
      unit:            r.UNIT,
      uom:             r.UNIT,
      category:        r.CATEGORY,
      // Fields for InventoryAvailability.jsx filters
      inventory_type:  "available",
      owner:           "supplier",
      permission:      "order",
      order_qty:       0,
      status: Number(r.AVAILABLE_QTY) > 0 ? "Available" : "Out of Stock",
    }));
}

// ================================================================
// IN TRANSIT — open deliveries heading to user's site/customer
// Uses adapter.getAllDeliveries() → LEWISB.SDELIVERY (SQL Server / X3)
// ================================================================
async function getInTransit(adapter, ctx, filters) {
  // getAllDeliveries expects a req-like object with user attached
  const fakeReq = { user: ctx };
  const deliveries = await adapter.getAllDeliveries(fakeReq);

  // Normalise column names from X3 raw field names
  return deliveries.map(d => ({
    delivery_no:   d.SDHNUM_0,
    order_no:      d.SOHNUM_0,
    from_site:     d.STOFCY_0,
    delivery_to:   d.BPDNAM_0,
    address_code:  d.BPAADD_0,
    expected_date: d.DLVDAT_0,
    ship_date:     d.SHIDAT_0,
    total_qty:     Number(d.DSPTOTQTY_0) || 0,
    customer_code: d.BPCORD_0,
    carrier:       d.BPTNAM_0,
    items: (d.items || []).map(i => ({
      product_code: i.ITMREF_0,
      product_desc: i.ITMDES1_0,
      qty:          Number(i.QTY_0)     || 0,
      unit:         i.SAU_0 || i.UNITS,
      unit_price:   Number(i.NETPRI_0)  || 0,
      total_amount: Number(i.total_amount) || 0,
    })),
  }));
}

// ================================================================
// RESERVED — allocated stock at user's site
// ================================================================
async function getReserved(adapter, ctx, filters) {
  const stock = await adapter.getStock({
    site:     ctx.site,
    product:  filters.search   || null,
    category: filters.category || null,
  });

  return stock
    .filter(r => Number(r.ALLOCATED_QTY) > 0)
    .map(r => ({
      product_code:  r.PRODUCT,
      product_desc:  r.PROD_DESC,
      site:          r.SITE,
      location:      r.LOCATION,
      reserved_qty:  Number(r.ALLOCATED_QTY) || 0,
      physical_qty:  Number(r.PHYSICAL_QTY)  || 0,
      unit:          r.UNIT,
    }));
}

// ================================================================
// PROJECTED — consignment available + incoming in-transit
// ================================================================
async function getProjected(adapter, ctx, filters) {
  const [consignment, inTransit] = await Promise.all([
    getConsignment(adapter, ctx, filters),
    getInTransit(adapter, ctx, filters),
  ]);

  // Build product → in-transit qty map
  const transitMap = {};
  for (const delivery of inTransit) {
    for (const item of (delivery.items || [])) {
      transitMap[item.product_code] = (transitMap[item.product_code] || 0) + (item.qty || 0);
    }
  }

  return consignment.map(row => ({
    ...row,
    in_transit_qty: transitMap[row.product_code] || 0,
    projected_qty:  row.available_qty + (transitMap[row.product_code] || 0),
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
