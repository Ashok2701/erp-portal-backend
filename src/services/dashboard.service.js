"use strict";
const db         = require("../config/db");
const ERPFactory = require("../erp/erp.factory");

// ================================================================
// ADMIN STATS
// ================================================================
exports.getAdminStats = async (user) => {

  // ── Postgres stats ───────────────────────────────────────────
  const [usersTotal, usersActive, usersByRole,
         modules, roles, roleModules,
         ordersTotal, ordersToday, ordersPending, ordersByStatus] = await Promise.all([
    db.query("SELECT COUNT(*) FROM users"),
    db.query("SELECT COUNT(*) FROM users WHERE is_active = true"),
    db.query(`SELECT r.role_name AS role, COUNT(u.user_id) AS count
              FROM users u
              JOIN user_roles ur ON u.user_id = ur.user_id
              JOIN roles r ON ur.role_id = r.role_id
              GROUP BY r.role_name`),
    db.query(`SELECT COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE is_active=true) AS active
              FROM modules`),
    db.query(`SELECT COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE is_active=true) AS active
              FROM roles`),
    db.query("SELECT COUNT(*) FROM role_modules"),
    db.query("SELECT COUNT(*) FROM sales_requests"),
    db.query("SELECT COUNT(*) FROM sales_requests WHERE DATE(created_time) = CURRENT_DATE"),
    db.query("SELECT COUNT(*) FROM sales_requests WHERE status='CREATED'"),
    db.query("SELECT status, COUNT(*) FROM sales_requests GROUP BY status"),
  ]);

  // ── ERP stats (via adapter — uses tenant settings) ───────────
  let products = [], categories = [], stock = [];
  try {
    const adapter = await ERPFactory.getERPAdapterForUser(user);
    [products, categories, stock] = await Promise.all([
      adapter.getProducts({}).catch(() => []),
      adapter.getProductCategories().catch(() => []),
      adapter.getStock({}).catch(() => []),
    ]);
  } catch (err) {
    console.warn("Dashboard ERP stats unavailable:", err.message);
  }

  const lowStock = stock.filter(s =>
    Number(s.AVAILABLE_QTY || s.available_qty || 0) < 10
  );

  return {
    users: {
      total:   Number(usersTotal.rows[0].count),
      active:  Number(usersActive.rows[0].count),
      by_role: Object.fromEntries(
        usersByRole.rows.map(r => [r.role, Number(r.count)])
      ),
    },
    modules: {
      total:  Number(modules.rows[0].total),
      active: Number(modules.rows[0].active),
    },
    roles: {
      total:  Number(roles.rows[0].total),
      active: Number(roles.rows[0].active),
    },
    role_modules: { total: Number(roleModules.rows[0].count) },
    products: {
      total:       products.length,
      categories:  categories.length,
      with_images: products.filter(p => p.PROD_IMG || p.prod_img).length,
      low_stock:   lowStock.length,
    },
    orders: {
      total:   Number(ordersTotal.rows[0].count),
      today:   Number(ordersToday.rows[0].count),
      pending: Number(ordersPending.rows[0].count),
      by_status: Object.fromEntries(
        ordersByStatus.rows.map(r => [r.status, Number(r.count)])
      ),
    },
  };
};

// ================================================================
// CUSTOMER DASHBOARD
// ================================================================
exports.getCustomerDashboard = async ({ username, from, to, preset, user }) => {

  // ── Resolve date range ────────────────────────────────────────
  const now = new Date();
  let dateFrom = from, dateTo = to;
  if (!dateFrom || !dateTo) {
    if (preset === "week") {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
    } else if (preset === "year") {
      dateFrom = new Date(now.getFullYear(), 0, 1).toISOString();
    } else {
      // default: current month
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }
    dateTo = now.toISOString();
  }

  // ── User info from Postgres ───────────────────────────────────
  const resolvedUser = user || {};
  const resolvedUsername = username || resolvedUser.username;

  const userResult = await db.query(
    `SELECT username, full_name, allowedsite, user_id, erp_entity_code
     FROM users WHERE username = $1`,
    [resolvedUsername]
  );
  if (!userResult.rows.length) throw new Error("User not found");
  const dbUser = userResult.rows[0];

  // ── KPIs from Postgres ────────────────────────────────────────
  const [kpiResult, recentOrdersResult, pendingResult, totalAmountResult] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS count FROM sales_requests
       WHERE user_id=$1 AND request_date BETWEEN $2 AND $3`,
      [dbUser.user_id, dateFrom, dateTo]
    ),
    db.query(
      `SELECT sr.drop_request_id AS request_no,
              DATE(sr.request_date) AS date,
              (SELECT COUNT(*) FROM sales_request_items sri
               WHERE sri.drop_request_id = sr.drop_request_id) AS products_count,
              sr.status, sr.erp_order_no AS so_number,
              sr.request_date AS delivery_date, sr.total_amount AS amount
       FROM sales_requests sr
       WHERE sr.user_id=$1 AND sr.request_date BETWEEN $2 AND $3
       ORDER BY sr.request_date DESC LIMIT 10`,
      [dbUser.user_id, dateFrom, dateTo]
    ),
    db.query(
      `SELECT COUNT(*) FROM sales_requests WHERE user_id=$1 AND status='CREATED'`,
      [dbUser.user_id]
    ),
    db.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total FROM sales_requests
       WHERE user_id=$1 AND request_date BETWEEN $2 AND $3`,
      [dbUser.user_id, dateFrom, dateTo]
    ),
  ]);

  // ── Site info from ERP (via adapter) ─────────────────────────
  let siteName = "";
  try {
    const erpUser = user || { tenant_id: null, user_id: dbUser.user_id };
    const adapter = await ERPFactory.getERPAdapterForUser(erpUser);
    const pool    = await adapter.poolPromise;
    const { sql } = require("mssql");
    const siteResult = await pool.request()
      .input("site", sql.VarChar, dbUser.allowedsite)
      .query(`SELECT FCYNAM_0 FROM LEWISB.XTMSUSRFCY WHERE XFCY_0 = @site`);
    siteName = siteResult.recordset[0]?.FCYNAM_0 || "";
  } catch (err) {
    console.warn("Dashboard site lookup failed:", err.message);
  }

  return {
    user: {
      username:     dbUser.username,
      display_name: dbUser.full_name,
      company_name: siteName,
    },
    date_range: { from: dateFrom, to: dateTo },
    recent_orders: recentOrdersResult.rows,
    kpis: {
      open_requests:          Number(pendingResult.rows[0].count),
      total_requests:         Number(kpiResult.rows[0].count),
      total_amount:           Number(totalAmountResult.rows[0].total),
      sales_orders:           0,
      orders_in_dispatch:     0,
      delivered_orders:       0,
      pending_payments_amount: 0,
      currency: "USD",
    },
    pipeline:        [],
    pending_actions: [],
    notifications:   [],
  };
};
