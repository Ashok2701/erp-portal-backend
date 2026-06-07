"use strict";
// ============================================================
// inventory.service.js
// Serves B2B inventory views — all data from SageX3 ERP
// Views: consignment | available | in-transit | reserved | projected
// ============================================================

const db       = require("../config/db");
const { sql, poolPromise } = require("../config/erp-db");
const UserModel = require("../models/user.model");

// ── resolve the user's site + customer code ──────────────────
async function resolveUserContext(user) {
  const userId = user.user_id || user.id;
  const userInfo = await UserModel.getUserById(userId);
  const u = userInfo[0] || {};
  return {
    site:         u.allowedsite || null,
    customerCode: u.erp_entity_code || null,
    entityType:   u.erp_entity_type || "customer",
  };
}

// ── main dispatcher ──────────────────────────────────────────
exports.getInventory = async (user, view, filters = {}) => {
  const ctx = await resolveUserContext(user);

  switch (view) {
    case "consignment":  return getConsignment(ctx, filters);
    case "available":    return getAvailable(ctx, filters);
    case "in-transit":   return getInTransit(ctx, filters);
    case "reserved":     return getReserved(ctx, filters);
    case "projected":    return getProjected(ctx, filters);
    default:             return getConsignment(ctx, filters);
  }
};

// ── summary counts for dashboard cards ───────────────────────
exports.getSummary = async (user) => {
  const ctx = await resolveUserContext(user);
  const [consignment, inTransit] = await Promise.all([
    getConsignment(ctx, {}),
    getInTransit(ctx, {}),
  ]);

  const totalPhysical   = consignment.reduce((s, r) => s + (Number(r.physical_qty)   || 0), 0);
  const totalAvailable  = consignment.reduce((s, r) => s + (Number(r.available_qty)  || 0), 0);
  const totalConsumed   = consignment.reduce((s, r) => s + (Number(r.allocated_qty)  || 0), 0);
  const totalInTransit  = inTransit.length;
  const lowStock        = consignment.filter(r => {
    const pct = r.physical_qty > 0 ? (r.available_qty / r.physical_qty) : 1;
    return pct < 0.2;
  }).length;

  return {
    total_physical:  totalPhysical,
    total_available: totalAvailable,
    total_consumed:  totalConsumed,
    in_transit_count: totalInTransit,
    low_stock_count:  lowStock,
  };
};

// ================================================================
// CONSIGNMENT — physical stock sitting at user's site
// Matches the screenshot: Product, Location, Physical, Consumed,
// Available, Status, Order Qty
// ================================================================
async function getConsignment(ctx, filters) {
  const pool    = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
      PRODUCT                                      AS product_code,
      PROD_DESC                                    AS product_desc,
      SITE                                         AS site,
      LOCATION                                     AS location,
      PHYSICAL_QTY                                 AS physical_qty,
      ALLOCATED_QTY                                AS allocated_qty,
      AVAILABLE_QTY                                AS available_qty,
      UNIT                                         AS unit,
      CATEGORY                                     AS category,
      CASE
        WHEN AVAILABLE_QTY <= 0 THEN 'Out of Stock'
        WHEN (AVAILABLE_QTY * 1.0 / NULLIF(PHYSICAL_QTY,0)) < 0.2 THEN 'Low'
        ELSE 'Active'
      END                                          AS status
    FROM LEWISB.XSTDALN_STOCK
    WHERE 1=1
  `;

  // Filter by user's allowed site
  if (ctx.site) {
    query += " AND SITE = @site";
    request.input("site", sql.VarChar, ctx.site);
  }

  // Optional search filter
  if (filters.search) {
    query += " AND (PRODUCT LIKE @search OR PROD_DESC LIKE @search)";
    request.input("search", sql.VarChar, `%${filters.search}%`);
  }

  if (filters.category) {
    query += " AND CATEGORY = @category";
    request.input("category", sql.VarChar, filters.category);
  }

  query += " ORDER BY PROD_DESC ASC";

  const result = await request.query(query);
  return result.recordset;
}

// ================================================================
// AVAILABLE — stock available across all sites (supplier view)
// ================================================================
async function getAvailable(ctx, filters) {
  const pool    = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
      PRODUCT       AS product_code,
      PROD_DESC     AS product_desc,
      SITE          AS site,
      LOCATION      AS location,
      AVAILABLE_QTY AS available_qty,
      UNIT          AS unit,
      CATEGORY      AS category
    FROM LEWISB.XSTDALN_STOCK
    WHERE AVAILABLE_QTY > 0
  `;

  if (filters.search) {
    query += " AND (PRODUCT LIKE @search OR PROD_DESC LIKE @search)";
    request.input("search", sql.VarChar, `%${filters.search}%`);
  }

  query += " ORDER BY PROD_DESC ASC";

  const result = await request.query(query);
  return result.recordset;
}

// ================================================================
// IN TRANSIT — open deliveries on the way to user's site
// ================================================================
async function getInTransit(ctx, filters) {
  const pool    = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
      A.SDHNUM_0    AS delivery_no,
      A.SOHNUM_0    AS order_no,
      A.STOFCY_0    AS from_site,
      A.BPDNAM_0    AS delivery_to,
      A.BPAADD_0    AS address_code,
      A.DLVDAT_0    AS expected_date,
      A.SHIDAT_0    AS ship_date,
      A.DSPTOTQTY_0 AS total_qty,
      A.BPCORD_0    AS customer_code,
      C.BPTNAM_0    AS carrier
    FROM LEWISB.SDELIVERY A
    LEFT JOIN tbs.LEWISB.BPCARRIER C ON A.BPTNUM_0 = C.BPTNUM_0
    WHERE A.DLVDAT_0 >= GETDATE()
  `;

  if (ctx.customerCode) {
    query += " AND A.BPCORD_0 = @customerCode";
    request.input("customerCode", sql.NVarChar, ctx.customerCode);
  }

  if (ctx.site) {
    query += " AND A.STOFCY_0 = @site";
    request.input("site", sql.VarChar, ctx.site);
  }

  query += " ORDER BY A.DLVDAT_0 ASC";

  const result = await request.query(query);

  // Enrich each delivery with its line items
  const enriched = await Promise.all(result.recordset.map(async (row) => {
    const items = await pool.request()
      .input("dlvNo", sql.NVarChar, row.delivery_no)
      .query(`
        SELECT
          A.ITMREF_0  AS product_code,
          A.ITMDES1_0 AS product_desc,
          A.QTY_0     AS qty,
          A.SAU_0     AS unit
        FROM tbs.LEWISB.SDELIVERYD A
        WHERE A.SDHNUM_0 = @dlvNo
      `);
    return { ...row, items: items.recordset };
  }));

  return enriched;
}

// ================================================================
// RESERVED — allocated / reserved stock at user's site
// ================================================================
async function getReserved(ctx, filters) {
  const pool    = await poolPromise;
  const request = pool.request();

  let query = `
    SELECT
      PRODUCT       AS product_code,
      PROD_DESC     AS product_desc,
      SITE          AS site,
      LOCATION      AS location,
      ALLOCATED_QTY AS reserved_qty,
      PHYSICAL_QTY  AS physical_qty,
      UNIT          AS unit
    FROM LEWISB.XSTDALN_STOCK
    WHERE ALLOCATED_QTY > 0
  `;

  if (ctx.site) {
    query += " AND SITE = @site";
    request.input("site", sql.VarChar, ctx.site);
  }

  query += " ORDER BY PROD_DESC ASC";

  const result = await request.query(query);
  return result.recordset;
}

// ================================================================
// PROJECTED — available + upcoming in-transit
// ================================================================
async function getProjected(ctx, filters) {
  const [consignment, inTransit] = await Promise.all([
    getConsignment(ctx, filters),
    getInTransit(ctx, filters),
  ]);

  // Build a map of product_code → in-transit qty
  const transitMap = {};
  for (const delivery of inTransit) {
    for (const item of (delivery.items || [])) {
      transitMap[item.product_code] = (transitMap[item.product_code] || 0) + (Number(item.qty) || 0);
    }
  }

  // Merge: available + in-transit
  return consignment.map(row => ({
    ...row,
    in_transit_qty: transitMap[row.product_code] || 0,
    projected_qty:  (Number(row.available_qty) || 0) + (transitMap[row.product_code] || 0),
  }));
}
