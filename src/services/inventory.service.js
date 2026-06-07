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

// ── summary counts for dashboard/header cards ─────────────────
exports.getSummary = async (user) => {
  const ctx     = await resolveUserContext(user);
  const adapter = await ERPFactory.getERPAdapterForUser(user);

  const stock = await adapter.getStock({
    site:     ctx.site,
    customer: ctx.customerCode,
  });

  const totalPhysical  = stock.reduce((s, r) => s + (Number(r.PHYSICAL_QTY)   || 0), 0);
  const totalAvailable = stock.reduce((s, r) => s + (Number(r.AVAILABLE_QTY)  || 0), 0);
  const totalConsumed  = stock.reduce((s, r) => s + (Number(r.ALLOCATED_QTY)  || 0), 0);
  const lowStockCount  = stock.filter(r => {
    const pct = r.PHYSICAL_QTY > 0 ? (r.AVAILABLE_QTY / r.PHYSICAL_QTY) : 1;
    return pct < 0.2;
  }).length;

  // In-transit = open deliveries count
  const deliveries = await adapter.getAllDeliveries({ user: ctx });
  
  return {
    total_physical:   totalPhysical,
    total_available:  totalAvailable,
    total_consumed:   totalConsumed,
    in_transit_count: deliveries.length,
    low_stock_count:  lowStockCount,
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
    site:          r.SITE,
    location:      r.LOCATION,
    physical_qty:  Number(r.PHYSICAL_QTY)   || 0,
    allocated_qty: Number(r.ALLOCATED_QTY)  || 0,
    available_qty: Number(r.AVAILABLE_QTY)  || 0,
    unit:          r.UNIT,
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
    product:  filters.search   || null,
    category: filters.category || null,
    // No site filter — show all sites
  });

  return stock
    .filter(r => Number(r.AVAILABLE_QTY) > 0)
    .map(r => ({
      product_code:  r.PRODUCT,
      product_desc:  r.PROD_DESC,
      site:          r.SITE,
      location:      r.LOCATION,
      available_qty: Number(r.AVAILABLE_QTY) || 0,
      unit:          r.UNIT,
      category:      r.CATEGORY,
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
