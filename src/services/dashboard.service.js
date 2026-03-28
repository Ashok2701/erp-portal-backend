const db = require("../config/db");
const ERPFactory = require("../erp/erp.factory");

exports.getAdminStats = async () => {

  // ---------- USERS ----------
  const usersTotal = await db.query(`SELECT COUNT(*) FROM users`);
  const usersActive = await db.query(`SELECT COUNT(*) FROM users WHERE status='ACTIVE'`);

  const usersByRole = await db.query(`
    SELECT role, COUNT(*) 
    FROM users 
    GROUP BY role
  `);

  // ---------- MODULES ----------
  const modules = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='ACTIVE') as active
    FROM modules
  `);

  // ---------- ROLES ----------
  const roles = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='ACTIVE') as active
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
  const ordersTotal = await db.query(`SELECT COUNT(*) FROM sales_request`);
  const ordersToday = await db.query(`
    SELECT COUNT(*) FROM sales_request 
    WHERE DATE(created_at) = CURRENT_DATE
  `);

  const ordersPending = await db.query(`
    SELECT COUNT(*) FROM sales_request 
    WHERE status='CREATED'
  `);

  const ordersByStatus = await db.query(`
    SELECT status, COUNT(*) 
    FROM sales_request 
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