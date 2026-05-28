const db = require("../config/db");
const ERPFactory = require("../erp/erp.factory");
const {
  sql,
  poolPromise
} = require("../config/erp-db");



exports.getAdminStats = async () => {

  // ---------- USERS ----------
  const usersTotal = await db.query(`SELECT COUNT(*) FROM users`);
  const usersActive = await db.query(`SELECT COUNT(*) FROM users WHERE is_active = true`);

  const usersByRole = await db.query(`
    SELECT 
  r.role_name AS role,
  COUNT(u.user_id) AS count
FROM users u
JOIN user_roles ur ON u.user_id = ur.user_id
JOIN roles r ON ur.role_id = r.role_id
GROUP BY r.role_name
  `);

  // ---------- MODULES ----------
  const modules = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active
    FROM modules
  `);

  // ---------- ROLES ----------
  const roles = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active
    FROM roles
  `);

  // ---------- ROLE MODULES ----------
  const roleModules = await db.query(`
    SELECT COUNT(*) FROM role_modules
  `);

  // ---------- PRODUCTS (ERP) ----------
  const adapter = ERPFactory.getERPAdapter();

  const products = await adapter.getProducts({});
  const categories = await adapter.getProductCategories();
  const stock = await adapter.getStock({});

  const lowStock = stock.filter(s => s.stock_qty < 10);

  // ---------- ORDERS ----------
  const ordersTotal = await db.query(`SELECT COUNT(*) FROM sales_requests`);
  const ordersToday = await db.query(`
    SELECT COUNT(*) FROM sales_requests 
    WHERE DATE(created_time) = CURRENT_DATE
  `);

  const ordersPending = await db.query(`
    SELECT COUNT(*) FROM sales_requests 
    WHERE status='CREATED'
  `);

  const ordersByStatus = await db.query(`
    SELECT status, COUNT(*) 
    FROM sales_requests 
    GROUP BY status
  `);

  // ---------- FORMAT RESPONSE ----------
  return {
    users: {
      total: Number(usersTotal.rows[0].count),
      active: Number(usersActive.rows[0].count),
      by_role: Object.fromEntries(
        usersByRole.rows.map(r => [r.role, Number(r.count)])
      )
    },

    modules: {
      total: Number(modules.rows[0].total),
      active: Number(modules.rows[0].active)
    },

    roles: {
      total: Number(roles.rows[0].total),
      active: Number(roles.rows[0].active)
    },

    role_modules: {
      total: Number(roleModules.rows[0].count)
    },

    products: {
      total: products.length,
      categories: categories.length,
      with_images: products.filter(p => p.PROD_IMG).length,
      low_stock: lowStock.length
    },

    orders: {
      total: Number(ordersTotal.rows[0].count),
      today: Number(ordersToday.rows[0].count),
      pending: Number(ordersPending.rows[0].count),
      by_status: Object.fromEntries(
        ordersByStatus.rows.map(r => [r.status, Number(r.count)])
      )
    }
  };
};



exports.getCustomerDashboard = async ({
  username,
  from,
  to,
  preset
}) => {

  // =========================================
  // POSTGRESQL
  // =========================================

  const userResult = await db.query(
    `
    SELECT
      username,
      full_name,
      allowedsite,user_id, erp_entity_code
    FROM users
    WHERE username = $1
    `,
    [username]
  );

  if (userResult.rows.length === 0) {
    throw new Error("User not found");
  }

  const user = userResult.rows[0];

  // =========================================
  // SQL SERVER
  // =========================================

  const pool = await poolPromise;

  const siteResult = await pool.request()
    .input(
      "site",
      sql.VarChar,
      user.allowedsite
    )
    .query(`
      SELECT
        XFCY_0,
        FCYNAM_0,
        CRY_0
      FROM LEWISB.XTMSUSRFCY
      WHERE XFCY_0 = @site
    `);

  const site =
    siteResult.recordset[0];

  // =========================================
  // POSTGRES KPI QUERY
  // =========================================

  const kpiResult = await db.query(
    `
    SELECT COUNT(*) AS count
    FROM sales_requests
    WHERE user_id = $1
    AND request_date BETWEEN $2 AND $3
    `,
    [user.user_id, from, to]
  );

  // =========================================
  // FINAL RESPONSE
  // =========================================

  return {

    user: {
      username: user.username,
      display_name: user.full_name,
      company_name: site?.FCYNAM_0 || ""
    },

    kpis: {
      open_requests:
        Number(kpiResult.rows[0].count),

      sales_orders: 48,
      orders_in_dispatch: 6,
      delivered_orders: 32,
      pending_payments_amount: 420000,
      currency: "USD"
    },

    pipeline: [],
    pending_actions: [],
    notifications: [],
    recent_orders: []
  };
};



