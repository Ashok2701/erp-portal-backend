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
    site:         ctx.site,
    product:      filters.search      || null,
    category:     filters.category    || null,
    // Filter by customer-owned locations (LOCTYP_0=3) in X3
    // Only applies when user has an erp_entity_code (B2B customer)
    customerCode: ctx.customerCode    || null,
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
    site:                    ctx.site,
    product:                 filters.search   || null,
    category:                filters.category || null,
    excludeCustomerLocations: true,   // Available = warehouse stock only, no customer bins
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
  const fakeReq = { user: ctx, inTransitOnly: true };  // only unvalidated deliveries
  const deliveries = await adapter.getAllDeliveries(fakeReq);

  // Flatten deliveries to per-product rows for InTransitInventory.jsx
  const rows = [];
  for (const d of deliveries) {
    const items = d.items || [];
    const shipmentRef = d.SDHNUM_0 || d.delivery_no || '';
    const fromSite    = d.STOFCY_0 || d.from_site   || '';
    const destination = d.BPDNAM_0 || d.delivery_to || ctx.customerCode || '';
    const dispatchDate= d.SHIDAT_0 || d.ship_date   || null;
    const eta         = d.DLVDAT_0 || d.expected_date|| null;
    const carrier     = d.BPTNAM_0 || '';

    const now = Date.now();
    const etaTs = eta ? new Date(eta).getTime() : null;
    const status = !etaTs ? 'IN_TRANSIT'
      : etaTs < now ? 'DELAYED'
      : etaTs - now < 2 * 24 * 3600 * 1000 ? 'ARRIVING_SOON'
      : 'IN_TRANSIT';

    // Build timeline steps
    const timeline = [
      { id: 1, label: 'Order Confirmed',  date: dispatchDate, done: true  },
      { id: 2, label: 'Dispatched',       date: dispatchDate, done: !!dispatchDate },
      { id: 3, label: 'In Transit',       date: null,         done: true  },
      { id: 4, label: 'Expected Arrival', date: eta,          done: false },
    ];

    if (items.length === 0) {
      // Delivery with no items — add as placeholder
      rows.push({
        id:           shipmentRef || String(rows.length),
        product_code: '',
        product_name: `Shipment ${shipmentRef}`,
        uom:          '',
        qty:          Number(d.DSPTOTQTY_0 || d.total_qty || 0),
        source:       fromSite,
        destination,
        shipment_ref: shipmentRef,
        dispatch_date:dispatchDate,
        eta,
        carrier,
        status,
        timeline,
        delivery_no:  shipmentRef,
      });
    } else {
      for (const item of items) {
        rows.push({
          id:           `${shipmentRef}-${item.ITMREF_0 || item.product_code || rows.length}`,
          product_code: item.ITMREF_0 || item.product_code || '',
          product_name: item.ITMDES1_0 || item.product_desc || item.product_code || '',
          uom:          item.SAU_0 || item.UNITS || item.unit || 'EA',
          qty:          Number(item.QTY_0 || item.qty || 0),
          source:       fromSite,
          destination,
          shipment_ref: shipmentRef,
          dispatch_date:dispatchDate,
          eta,
          carrier,
          status,
          timeline,
          delivery_no:  shipmentRef,
          // Keep nested for projected use
          items:        items,
          expected_date: eta,
          delivery_date: eta,
        });
      }
    }
  }
  return rows;
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
    .map((r, i) => ({
      id:             `${r.PRODUCT}-${r.LOCATION || i}`,
      product_code:   r.PRODUCT,
      product_name:   r.PROD_DESC,
      product_desc:   r.PROD_DESC,
      site:           r.SITE,
      location:       r.LOCATION || r.SITE || '',
      customer:       ctx.customerCode || ctx.site || '',
      allocated_qty:  Number(r.ALLOCATED_QTY) || 0,
      used_qty:       Math.max(0, Number(r.ALLOCATED_QTY) - Number(r.AVAILABLE_QTY)),
      remaining_qty:  Number(r.AVAILABLE_QTY) || 0,
      physical_qty:   Number(r.PHYSICAL_QTY)  || 0,
      reserved_qty:   Number(r.ALLOCATED_QTY) || 0,
      uom:            r.UNIT || 'EA',
      unit:           r.UNIT,
      allocation_date: r.LAST_UPDATE || null,
      status:         'RESERVED',
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

  // Build product → future deliveries map
  const futureMap = {};
  for (const delivery of inTransit) {
    const date = delivery.expected_date || delivery.delivery_date || null;
    for (const item of (delivery.items || [])) {
      const code = item.product_code;
      if (!code) continue;
      if (!futureMap[code]) futureMap[code] = [];
      futureMap[code].push({
        date:   date,
        qty:    Number(item.qty || item.quantity || 0),
        source: 'In Transit',
      });
    }
  }

  return consignment.map((row, i) => ({
    id:              `${row.product_code}-${i}`,
    product_code:    row.product_code,
    product_name:    row.description || row.product_desc || row.product_code,
    uom:             row.uom || row.unit || 'EA',
    unit:            row.unit,
    site:            row.site,
    location:        row.location,
    available_today: Number(row.available_qty) || 0,
    physical_qty:    Number(row.physical_qty)  || 0,
    allocated_qty:   Number(row.allocated_qty) || 0,
    in_transit_qty:  (futureMap[row.product_code] || []).reduce((s,f) => s + f.qty, 0),
    projected_qty:   Number(row.available_qty) + (futureMap[row.product_code] || []).reduce((s,f) => s + f.qty, 0),
    future:          (futureMap[row.product_code] || []).slice(0, 5),
    category:        row.category,
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
