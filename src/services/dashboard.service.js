"use strict";
const db         = require("../config/db");
const ERPFactory = require("../erp/erp.factory");
const mssql      = require("mssql");
const sql        = mssql;

// ================================================================
// ADMIN DASHBOARD — full data for AdminDashboard.jsx
// ================================================================
exports.getAdminStats = async (user) => {
  const tenant_id = user?.tenant_id;

  const [
    usersTotal, usersActive, usersByRole,
    modules, roles, roleModules,
    ordersTotal, ordersToday, ordersPending, ordersByStatus,
    newSignups7d, pendingVerification, pendingApproval,
    recentSignups, recentOrders, recentSigned,
    unreadMessages
  ] = await Promise.all([
    db.query("SELECT COUNT(*) FROM users WHERE tenant_id=$1", [tenant_id]),
    db.query("SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND is_active=true", [tenant_id]),
    db.query(`SELECT r.role_name AS role, COUNT(u.user_id) AS count
              FROM users u
              JOIN user_roles ur ON u.user_id=ur.user_id
              JOIN roles r ON ur.role_id=r.role_id
              WHERE u.tenant_id=$1 GROUP BY r.role_name`, [tenant_id]),
    db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE is_active=true) AS active FROM modules`),
    db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE is_active=true) AS active FROM roles`),
    db.query("SELECT COUNT(*) FROM role_modules"),
    db.query("SELECT COUNT(*) FROM sales_requests WHERE user_id IN (SELECT user_id FROM users WHERE tenant_id=$1)", [tenant_id]),
    db.query("SELECT COUNT(*) FROM sales_requests WHERE DATE(created_time)=CURRENT_DATE AND user_id IN (SELECT user_id FROM users WHERE tenant_id=$1)", [tenant_id]),
    db.query("SELECT COUNT(*) FROM sales_requests WHERE status='CREATED' AND user_id IN (SELECT user_id FROM users WHERE tenant_id=$1)", [tenant_id]),
    db.query(`SELECT status, COUNT(*) FROM sales_requests
              WHERE user_id IN (SELECT user_id FROM users WHERE tenant_id=$1) GROUP BY status`, [tenant_id]),
    db.query(`SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND created_at >= NOW()-INTERVAL '7 days'`, [tenant_id]),
    db.query(`SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND status='IN_VERIFICATION'`, [tenant_id]),
    db.query(`SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND status='PENDING_APPROVAL'`, [tenant_id]),
    db.query(`SELECT username, full_name, email, status, created_at
              FROM users WHERE tenant_id=$1
              ORDER BY created_at DESC LIMIT 10`, [tenant_id]),
    db.query(`SELECT sr.drop_request_id, u.username, u.full_name,
                     sr.total_amount, sr.status, sr.created_time
              FROM sales_requests sr
              JOIN users u ON u.user_id=sr.user_id
              WHERE u.tenant_id=$1
              ORDER BY sr.created_time DESC LIMIT 10`, [tenant_id]),
    db.query(`SELECT usd.signed_at, usd.username, ld.title AS doc_title
              FROM user_signed_documents usd
              JOIN legal_documents ld ON ld.id=usd.legal_document_id
              WHERE ld.tenant_id=$1
              ORDER BY usd.signed_at DESC LIMIT 10`, [tenant_id]),
    db.query(`SELECT COUNT(*) FROM content
              WHERE tenant_id=$1 AND type='MESSAGE'
              AND created_at >= NOW()-INTERVAL '7 days'`, [tenant_id]),
  ]);

  // ERP stats — race with 3s timeout
  let products = [], categories = [];
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000));
    const erpFetch = (async () => {
      const adapter = await ERPFactory.getERPAdapterForUser(user);
      return Promise.all([
        adapter.getProducts({}).catch(() => []),
        adapter.getProductCategories().catch(() => []),
      ]);
    })();
    [products, categories] = await Promise.race([erpFetch, timeout]);
  } catch (_) {}

  const activityFeed = [];
  for (const r of recentSignups.rows.slice(0, 5)) {
    activityFeed.push({ type: "signup", icon: "user-plus", color: "blue",
      message: `${r.full_name || r.username} requested access`,
      sub: r.status, time: r.created_at });
  }
  for (const r of recentOrders.rows.slice(0, 5)) {
    activityFeed.push({ type: "order", icon: "shopping-cart", color: "emerald",
      message: `New order from ${r.full_name || r.username}`,
      sub: `$${Number(r.total_amount||0).toFixed(2)}`, time: r.created_time });
  }
  for (const r of recentSigned.rows.slice(0, 5)) {
    activityFeed.push({ type: "signed", icon: "pen", color: "violet",
      message: `${r.username} signed "${r.doc_title}"`,
      sub: "Document signed", time: r.signed_at });
  }
  activityFeed.sort((a,b) => new Date(b.time) - new Date(a.time));

  const funnelRes = await db.query(
    `SELECT status, COUNT(*) FROM users WHERE tenant_id=$1
     AND status IN ('CREATED','IN_VERIFICATION','PENDING_APPROVAL','ACTIVE','REJECTED')
     GROUP BY status`,
    [tenant_id]
  );
  const funnelMap = Object.fromEntries(funnelRes.rows.map(r => [r.status, Number(r.count)]));

  return {
    users: {
      total:   Number(usersTotal.rows[0].count),
      active:  Number(usersActive.rows[0].count),
      by_role: Object.fromEntries(usersByRole.rows.map(r => [r.role, Number(r.count)])),
      new_this_week: Number(newSignups7d.rows[0].count),
    },
    modules:     { total: Number(modules.rows[0].total), active: Number(modules.rows[0].active) },
    roles:       { total: Number(roles.rows[0].total),   active: Number(roles.rows[0].active)   },
    role_modules:{ total: Number(roleModules.rows[0].count) },
    products:    { total: products.length, categories: categories.length },
    orders: {
      total:   Number(ordersTotal.rows[0].count),
      today:   Number(ordersToday.rows[0].count),
      pending: Number(ordersPending.rows[0].count),
      by_status: Object.fromEntries(ordersByStatus.rows.map(r => [r.status, Number(r.count)])),
    },
    pending_actions: {
      awaiting_verification: Number(pendingVerification.rows[0].count),
      pending_approval:      Number(pendingApproval.rows[0].count),
      unprocessed_orders:    Number(ordersPending.rows[0].count),
      new_messages:          Number(unreadMessages.rows[0].count),
    },
    lifecycle_funnel: [
      { stage: "Signed Up",   count: funnelMap['CREATED']          || 0, color: "blue"   },
      { stage: "Docs Sent",   count: funnelMap['IN_VERIFICATION']   || 0, color: "amber"  },
      { stage: "Docs Signed", count: funnelMap['PENDING_APPROVAL']  || 0, color: "violet" },
      { stage: "Active",      count: funnelMap['ACTIVE']            || 0, color: "emerald"},
      { stage: "Rejected",    count: funnelMap['REJECTED']          || 0, color: "rose"   },
    ],
    activity_feed: activityFeed.slice(0, 15),
  };
};

// ================================================================
// CUSTOMER STATS  — /dashboard/stats  (Dashboard.jsx legacy)
// ================================================================
exports.getCustomerStats = async (user) => {
  const user_id = user?.user_id;
  const [ordersRes, revenueRes] = await Promise.all([
    db.query(`SELECT status, COUNT(*) as count FROM sales_requests
              WHERE user_id=$1::uuid GROUP BY status`, [user_id]),
    db.query(`SELECT COALESCE(SUM(total_amount),0) as total FROM sales_requests WHERE user_id=$1::uuid`, [user_id]),
  ]);
  const byStatus = {};
  for (const row of ordersRes.rows) byStatus[(row.status || "").toLowerCase()] = Number(row.count);
  const total_orders = ordersRes.rows.reduce((s,r) => s + Number(r.count), 0);
  return {
    success: true,
    data: {
      total_orders,
      pending_orders:    byStatus["created"]            || 0,
      confirmed_orders:  byStatus["order generated"]    || 0,
      scheduled_orders:  byStatus["delivery scheduled"] || 0,
      delivered_orders:  byStatus["completed"]          || 0,
      today_ready:       (byStatus["order generated"]||0) + (byStatus["delivery scheduled"]||0),
      total_revenue:     Number(revenueRes.rows[0]?.total || 0),
    }
  };
};

// ================================================================
// CUSTOMER DASHBOARD — /dashboard/customer  (DashboardKPIPanel)
// ================================================================
exports.getCustomerDashboard = async ({ username, from, to, preset, user }) => {
  const now = new Date();
  let dateFrom = from, dateTo = to;
  if (!dateFrom || !dateTo) {
    if (preset === "this_week") {
      const day = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - (day - 1));
      dateFrom = mon.toISOString().slice(0, 10);
      dateTo   = now.toISOString().slice(0, 10);
    } else if (preset === "this_month") {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      dateTo   = now.toISOString().slice(0, 10);
    } else {
      dateFrom = dateTo = now.toISOString().slice(0, 10);
    }
  }

  const resolvedUsername = username || user?.username;
  const userRes = await db.query(
    `SELECT user_id, username, full_name, allowedsite, erp_entity_code
     FROM users WHERE username=$1`, [resolvedUsername]
  );
  if (!userRes.rows.length) throw new Error("User not found");
  const dbUser = userRes.rows[0];
  const uid    = dbUser.user_id;
  const customerCode = dbUser.erp_entity_code || null;

  const fromTs = `${dateFrom} 00:00:00`;
  const toTs   = `${dateTo}   23:59:59`;

  // ── 1. Portal DB queries (always available) ──────────────────────
  let openReq, recentOrders, pipeline, unsignedDocs, unreadContent, approvalStatus;
  try {
    [openReq, recentOrders, pipeline, unsignedDocs, unreadContent, approvalStatus] = await Promise.all([
      // Open requests: all not-yet-completed portal requests
      db.query(
        `SELECT COUNT(*) FROM sales_requests
         WHERE user_id=$1::uuid
         AND UPPER(status) IN ('CREATED','REQUEST_CREATED','DRAFT','PENDING')`,
        [uid]
      ),
      // Recent portal requests (last 10)
      db.query(
        `SELECT sr.drop_request_id AS request_no,
                DATE(sr.request_date)  AS date,
                (SELECT COUNT(*) FROM sales_request_items sri WHERE sri.drop_request_id=sr.drop_request_id) AS products_count,
                sr.status,
                sr.erp_order_no AS so_number,
                sr.request_date AS delivery_date,
                sr.total_amount AS amount
         FROM sales_requests sr
         WHERE sr.user_id=$1::uuid
         ORDER BY sr.request_date DESC LIMIT 10`,
        [uid]
      ),
      // Pipeline counts by status
      db.query(
        `SELECT status, COUNT(*) FROM sales_requests WHERE user_id=$1::uuid GROUP BY status`,
        [uid]
      ),
      // Unsigned legal documents
      db.query(
        `SELECT c.id AS content_id, c.title, ld.id AS legal_doc_id
         FROM content c
         JOIN legal_documents ld ON ld.id=c.legal_document_id
         WHERE c.type='DOCUMENT'
         AND EXISTS (
           SELECT 1 FROM content_targets ct
           WHERE ct.content_id=c.id
           AND (ct.target_value=$1::text
                OR ct.target_value=(SELECT role_id::text FROM user_roles WHERE user_id=$1::uuid LIMIT 1)
                OR ct.target_type='ALL')
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_signed_documents usd
           WHERE usd.user_id=$1::uuid AND usd.legal_document_id=ld.id
         )
         LIMIT 5`,
        [uid]
      ),
      // Unread content
      db.query(
        `SELECT c.id, c.title, c.type, c.message, c.priority, c.created_at
         FROM content c
         JOIN content_targets ct ON ct.content_id=c.id
         WHERE c.type IN ('OFFER','ANNOUNCEMENT','MESSAGE')
         AND (ct.target_value=$1::text OR ct.target_type='ALL'
              OR ct.target_value IN (SELECT role_id::text FROM user_roles WHERE user_id=$1::uuid))
         AND c.created_at >= NOW() - INTERVAL '30 days'
         ORDER BY c.created_at DESC LIMIT 8`,
        [uid]
      ),
      // Account status
      db.query(`SELECT status FROM users WHERE user_id=$1::uuid`, [uid]),
    ]);
  } catch (qErr) {
    console.error("Dashboard portal query error:", qErr.message);
    return {
      kpis: { open_requests: 0, sales_orders: 0, orders_in_dispatch: 0, delivered_orders: 0, pending_payments_amount: 0, total_amount: 0 },
      pipeline: [], recent_orders: [], pending_actions: [], notifications: [],
      unsigned_docs: [], unread_content: [], account_status: "active",
      _error: qErr.message,
    };
  }

  // ── 2. X3 ERP queries (sales orders, deliveries, pending payments) ──
  let salesOrdersCount    = 0;
  let ordersInDispatch    = 0;
  let deliveredOrders     = 0;
  let pendingPaymentsAmt  = 0;
  let totalAmountPeriod   = 0;
  let unexpiredQuotes     = 0;

  try {
    const erpUser   = { ...user, ...dbUser, user_id: uid };
    const adapter   = await ERPFactory.getERPAdapterForUser(erpUser);
    const pool      = await adapter.poolPromise;

    if (customerCode) {
      // Sales Orders count from X3 SORDER filtered by customer + date range
      const soRes = await pool.request()
        .input("customerCode", sql.NVarChar, customerCode)
        .input("dateFrom",     sql.Date,     new Date(dateFrom))
        .input("dateTo",       sql.Date,     new Date(dateTo))
        .query(`
          SELECT COUNT(*) AS cnt
          FROM tbs.LEWISB.SORDER
          WHERE BPCORD_0 = @customerCode
            AND ORDDAT_0 BETWEEN @dateFrom AND @dateTo
        `);
      salesOrdersCount = Number(soRes.recordset[0]?.cnt || 0);

      // Unexpired Quotes — SQHNUM from SQUOTE where QUODAT_0 >= today
      try {
        const quotRes = await pool.request()
          .input("custQ", sql.NVarChar, customerCode)
          .query(\`
            SELECT COUNT(*) AS cnt
            FROM LEWISB.SQUOTE
            WHERE BPCORD_0 = @custQ
              AND QUODAT_0 >= CAST(GETDATE() AS DATE)
          \`);
        unexpiredQuotes = Number(quotRes.recordset[0]?.cnt || 0);
      } catch (_) {}

      // Orders in Dispatch = SDELIVERY where VCRSTA_0 = 1 (in progress, not yet delivered)
      const dispRes = await pool.request()
        .input("customerCode", sql.NVarChar, customerCode)
        .input("dateFrom",     sql.Date,     new Date(dateFrom))
        .input("dateTo",       sql.Date,     new Date(dateTo))
        .query(`
          SELECT COUNT(*) AS cnt
          FROM LEWISB.SDELIVERY
          WHERE BPCORD_0 = @customerCode
            AND VCRSTA_0 = 1
            AND DLVDAT_0 BETWEEN @dateFrom AND @dateTo
        `);
      ordersInDispatch = Number(dispRes.recordset[0]?.cnt || 0);

      // Delivered = SDELIVERY where VCRSTA_0 = 3 (validated/posted = delivered)
      const delivRes = await pool.request()
        .input("customerCode", sql.NVarChar, customerCode)
        .input("dateFrom",     sql.Date,     new Date(dateFrom))
        .input("dateTo",       sql.Date,     new Date(dateTo))
        .query(`
          SELECT COUNT(*) AS cnt
          FROM LEWISB.SDELIVERY
          WHERE BPCORD_0 = @customerCode
            AND VCRSTA_0 = 3
            AND DLVDAT_0 BETWEEN @dateFrom AND @dateTo
        `);
      deliveredOrders = Number(delivRes.recordset[0]?.cnt || 0);

      // Pending Payments = SINVOICE where not fully paid (STA_0 != '3' means not paid/cleared)
      // STA_0: 1=Draft, 2=Posted/Unpaid, 3=Paid
      const payRes = await pool.request()
        .input("customerCode", sql.NVarChar, customerCode)
        .query(`
          SELECT COALESCE(SUM(AMTATI_0), 0) AS total
          FROM tbs.LEWISB.SINVOICE
          WHERE BPR_0 = @customerCode
            AND STA_0 IN ('1', '2')
            AND SIVTYP_0 NOT IN ('AVC','CRN','CNO','AVI')
        `);
      pendingPaymentsAmt = Number(payRes.recordset[0]?.total || 0);

      // Total invoiced amount in the date range
      const totRes = await pool.request()
        .input("customerCode", sql.NVarChar, customerCode)
        .input("dateFrom",     sql.Date,     new Date(dateFrom))
        .input("dateTo",       sql.Date,     new Date(dateTo))
        .query(`
          SELECT COALESCE(SUM(AMTATI_0), 0) AS total
          FROM tbs.LEWISB.SINVOICE
          WHERE BPR_0 = @customerCode
            AND ACCDAT_0 BETWEEN @dateFrom AND @dateTo
            AND SIVTYP_0 NOT IN ('AVC','CRN','CNO','AVI')
        `);
      totalAmountPeriod = Number(totRes.recordset[0]?.total || 0);
    }
  } catch (erpErr) {
    console.error("Dashboard ERP query error:", erpErr.message);
    // Fallback: use portal data for counts if X3 is unavailable
    const fromTs2 = `${dateFrom} 00:00:00`;
    const toTs2   = `${dateTo}   23:59:59`;
    try {
      const [soFb, dispFb, delivFb, payFb, totFb] = await Promise.all([
        db.query(`SELECT COUNT(*) FROM sales_requests WHERE user_id=$1::uuid AND UPPER(status)='ORDER GENERATED' AND request_date BETWEEN $2 AND $3`, [uid, fromTs2, toTs2]),
        db.query(`SELECT COUNT(*) FROM sales_requests WHERE user_id=$1::uuid AND UPPER(status)='DELIVERY SCHEDULED' AND request_date BETWEEN $2 AND $3`, [uid, fromTs2, toTs2]),
        db.query(`SELECT COUNT(*) FROM sales_requests WHERE user_id=$1::uuid AND UPPER(status)='COMPLETED' AND request_date BETWEEN $2 AND $3`, [uid, fromTs2, toTs2]),
        db.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales_requests WHERE user_id=$1::uuid AND UPPER(status) IN ('CREATED','REQUEST_CREATED','DRAFT')`, [uid]),
        db.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales_requests WHERE user_id=$1::uuid AND request_date BETWEEN $2 AND $3`, [uid, fromTs2, toTs2]),
      ]);
      salesOrdersCount   = Number(soFb.rows[0].count   || 0);
      ordersInDispatch   = Number(dispFb.rows[0].count  || 0);
      deliveredOrders    = Number(delivFb.rows[0].count || 0);
      pendingPaymentsAmt = Number(payFb.rows[0].total   || 0);
      totalAmountPeriod  = Number(totFb.rows[0].total   || 0);
    } catch (fbErr) {
      console.error("Dashboard fallback query error:", fbErr.message);
    }
  }

  // ── 3. Build pipeline stages ─────────────────────────────────────
  const statusMap = {};
  for (const r of pipeline.rows) statusMap[(r.status || "").toUpperCase()] = Number(r.count);

  const pipelineStages = [
    { stage: "request_raised", label: "Request Raised",        count: (statusMap["CREATED"] || statusMap["REQUEST_CREATED"] || statusMap["DRAFT"] || 0) },
    { stage: "under_review",   label: "Under Review",          count: (statusMap["PROCESSING"] || statusMap["UNDER REVIEW"] || 0) },
    { stage: "so_created",     label: "Approved / SO Created", count: salesOrdersCount },
    { stage: "in_dispatch",    label: "In Dispatch",           count: ordersInDispatch },
    { stage: "delivered",      label: "Delivered",             count: deliveredOrders },
  ];

  // ── 4. Pending actions ────────────────────────────────────────────
  const pendingActions = [];
  const unsignedCount = unsignedDocs.rows.length;
  if (unsignedCount > 0)
    pendingActions.push({ key: "unsigned_docs", label: "Documents to Sign", count: unsignedCount, icon: "pen", path: "/inbox" });
  if (Number(openReq.rows[0].count) > 0)
    pendingActions.push({ key: "open_requests", label: "Open Order Requests", count: Number(openReq.rows[0].count), icon: "clock", path: "/sales-requests" });
  if (pendingPaymentsAmt > 0)
    pendingActions.push({ key: "payments_due", label: "Payments Due", count: null, icon: "credit-card", path: "/payments", amount: pendingPaymentsAmt });

  // ── 5. Notifications ──────────────────────────────────────────────
  const notifications = [];
  for (const row of unsignedDocs.rows) {
    notifications.push({ id: `doc-${row.content_id}`, type: "doc_to_sign",
      message: `Sign required: "${row.title}"`, timestamp: null, path: `/inbox/${row.content_id}`, urgent: true });
  }
  for (const row of unreadContent.rows) {
    const typeMap = { OFFER: "special_offer", ANNOUNCEMENT: "announcement", MESSAGE: "message_received" };
    notifications.push({ id: `c-${row.id}`, type: typeMap[row.type] || "announcement",
      message: row.title, timestamp: row.created_at, path: `/inbox/${row.id}`, urgent: row.priority === "high" });
  }

  return {
    user: { username: dbUser.username, display_name: dbUser.full_name, site: dbUser.allowedsite },
    account_status: approvalStatus.rows[0]?.status,
    date_range: { from: dateFrom, to: dateTo },
    kpis: {
      open_requests:           Number(openReq.rows[0].count),
      sales_orders:            salesOrdersCount,
      orders_in_dispatch:      ordersInDispatch,
      delivered_orders:        deliveredOrders,
      pending_payments_amount: pendingPaymentsAmt,
      total_payment_due:       pendingPaymentsAmt, // same field — total outstanding
      unexpired_quotes:        unexpiredQuotes,
      total_amount:            totalAmountPeriod,
      currency: "USD",
    },
    pipeline:        pipelineStages,
    pending_actions: pendingActions,
    notifications,
    recent_orders:   recentOrders.rows,
  };
};
