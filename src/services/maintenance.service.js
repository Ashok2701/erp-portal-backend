"use strict";
const db = require("../config/db");

// ── Get currently active maintenance plan (customer-facing) ──────
exports.getActivePlan = async (tenantId) => {
  const now = new Date().toISOString();
  const result = await db.query(
    `SELECT id, title, message, type,
            blocks_orders, blocks_cart, blocks_stock_requests,
            start_date, end_date
     FROM maintenance_plans
     WHERE tenant_id = $1
       AND is_active = true
       AND start_date <= $2
       AND end_date   >= $2
     ORDER BY start_date DESC
     LIMIT 1`,
    [tenantId, now]
  );
  return result.rows[0] || null;
};

// ── Get upcoming plans (within next 7 days, not yet started) ─────
exports.getUpcomingPlans = async (tenantId) => {
  const now  = new Date().toISOString();
  const soon = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const result = await db.query(
    `SELECT id, title, message, type, start_date, end_date
     FROM maintenance_plans
     WHERE tenant_id = $1
       AND is_active = true
       AND start_date > $2
       AND start_date <= $3
     ORDER BY start_date ASC`,
    [tenantId, now, soon]
  );
  return result.rows;
};

// ── Admin: list all plans ─────────────────────────────────────────
exports.listPlans = async (tenantId) => {
  const result = await db.query(
    `SELECT mp.*, u.username AS created_by_name
     FROM maintenance_plans mp
     LEFT JOIN users u ON u.user_id = mp.created_by
     WHERE mp.tenant_id = $1
     ORDER BY mp.start_date DESC`,
    [tenantId]
  );
  return result.rows;
};

// ── Admin: create plan ────────────────────────────────────────────
exports.createPlan = async (tenantId, userId, body) => {
  const {
    title, message, type = "maintenance",
    blocks_orders = true, blocks_cart = false, blocks_stock_requests = true,
    start_date, end_date, is_active = true
  } = body;

  const result = await db.query(
    `INSERT INTO maintenance_plans
       (tenant_id, title, message, type,
        blocks_orders, blocks_cart, blocks_stock_requests,
        start_date, end_date, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [tenantId, title, message, type,
     blocks_orders, blocks_cart, blocks_stock_requests,
     start_date, end_date, is_active, userId]
  );
  return result.rows[0];
};

// ── Admin: update plan ────────────────────────────────────────────
exports.updatePlan = async (tenantId, id, body) => {
  const {
    title, message, type,
    blocks_orders, blocks_cart, blocks_stock_requests,
    start_date, end_date, is_active
  } = body;

  const result = await db.query(
    `UPDATE maintenance_plans SET
       title=$3, message=$4, type=$5,
       blocks_orders=$6, blocks_cart=$7, blocks_stock_requests=$8,
       start_date=$9, end_date=$10, is_active=$11,
       updated_at=NOW()
     WHERE id=$1 AND tenant_id=$2
     RETURNING *`,
    [id, tenantId, title, message, type,
     blocks_orders, blocks_cart, blocks_stock_requests,
     start_date, end_date, is_active]
  );
  return result.rows[0];
};

// ── Admin: delete plan ────────────────────────────────────────────
exports.deletePlan = async (tenantId, id) => {
  await db.query(
    `DELETE FROM maintenance_plans WHERE id=$1 AND tenant_id=$2`,
    [id, tenantId]
  );
};

// ── Owner: list ALL plans across all tenants ──────────────────────
exports.listAllPlans = async () => {
  const result = await db.query(
    `SELECT mp.*, u.username AS created_by_name, t.tenant_name
     FROM maintenance_plans mp
     LEFT JOIN users u ON u.user_id = mp.created_by
     LEFT JOIN tenants t ON t.tenant_id = mp.tenant_id
     ORDER BY mp.start_date DESC`
  );
  return result.rows;
};
