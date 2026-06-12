"use strict";
const db      = require("../config/db");
const ERPFactory = require("../erp/erp.factory");

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
    // Activity feed data
    db.query(`SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND created_at >= NOW()-INTERVAL '7 days'`, [tenant_id]),
    db.query(`SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND status='IN_VERIFICATION'`, [tenant_id]),
    db.query(`SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND status='PENDING_APPROVAL'`, [tenant_id]),
    // Recent signups (last 10)
    db.query(`SELECT username, full_name, email, status, created_at
              FROM users WHERE tenant_id=$1
              ORDER BY created_at DESC LIMIT 10`, [tenant_id]),
    // Recent orders (last 10)
    db.query(`SELECT sr.drop_request_id, u.username, u.full_name,
                     sr.total_amount, sr.status, sr.created_time
              FROM sales_requests sr
              JOIN users u ON u.user_id=sr.user_id
              WHERE u.tenant_id=$1
              ORDER BY sr.created_time DESC LIMIT 10`, [tenant_id]),
    // Recent document signings
    db.query(`SELECT usd.signed_at, usd.username, ld.title AS doc_title
              FROM user_signed_documents usd
              JOIN legal_documents ld ON ld.id=usd.legal_document_id
              WHERE ld.tenant_id=$1
              ORDER BY usd.signed_at DESC LIMIT 10`, [tenant_id]),
    // Unread/unprocessed content messages
    db.query(`SELECT COUNT(*) FROM content
              WHERE tenant_id=$1 AND type='MESSAGE'
              AND created_at >= NOW()-INTERVAL '7 days'`, [tenant_id]),
  ]);

  // ERP stats — race with 3s timeout so slow X3 never blocks dashboard
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

  // Build unified activity feed sorted by time
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

  // User lifecycle funnel
  // Funnel queries merged with a single efficient query
  const funnelRes = await db.query(
    `SELECT status, COUNT(*) FROM users WHERE tenant_id=$1
     AND status IN ('CREATED','IN_VERIFICATION','PENDING_APPROVAL','ACTIVE','REJECTED')
     GROUP BY status`,
    [tenant_id]
  );
  const funnelMap = Object.fromEntries(funnelRes.rows.map(r => [r.status, Number(r.count)]));
  const [fCreated, fVerif, fPendApproval, fActive, fRejected] = [
    { rows: [{ count: funnelMap['CREATED'] || 0 }] },
    { rows: [{ count: funnelMap['IN_VERIFICATION'] || 0 }] },
    { rows: [{ count: funnelMap['PENDING_APPROVAL'] || 0 }] },
    { rows: [{ count: funnelMap['ACTIVE'] || 0 }] },
    { rows: [{ count: funnelMap['REJECTED'] || 0 }] },
  ];

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
      { stage: "Signed Up",        count: Number(fCreated.rows[0].count),     color: "blue"   },
      { stage: "Docs Sent",        count: Number(fVerif.rows[0].count),       color: "amber"  },
      { stage: "Docs Signed",      count: Number(fPendApproval.rows[0].count),color: "violet" },
      { stage: "Active",           count: Number(fActive.rows[0].count),      color: "emerald"},
      { stage: "Rejected",         count: Number(fRejected.rows[0].count),    color: "rose"   },
    ],
    activity_feed: activityFeed.slice(0, 15),
  };
};

// ================================================================
// CUSTOMER STATS  — /dashboard/stats  (Dashboard.jsx)
// ================================================================
exports.getCustomerStats = async (user) => {
  const user_id = user?.user_id;
  const [ordersRes, revenueRes] = await Promise.all([
    db.query(`SELECT status, COUNT(*) as count FROM sales_requests
              WHERE user_id=$1::uuid GROUP BY status`, [user_id]),
    db.query(`SELECT COALESCE(SUM(total_amount),0) as total FROM sales_requests WHERE user_id=$1::uuid`, [user_id]),
  ]);
  const byStatus = {};
  for (const row of ordersRes.rows) byStatus[(row.status||"").toLowerCase()] = Number(row.count);
  const total_orders  = ordersRes.rows.reduce((s,r) => s + Number(r.count), 0);
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
// CUSTOMER DASHBOARD  — /dashboard/customer  (DashboardKPIPanel)
// ================================================================
exports.getCustomerDashboard = async ({ username, from, to, preset, user }) => {
  const now = new Date();
  let dateFrom = from, dateTo = to;
  if (!dateFrom || !dateTo) {
    if (preset === "this_week") {
      const day = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - (day-1));
      dateFrom = mon.toISOString().slice(0,10);
      dateTo   = now.toISOString().slice(0,10);
    } else if (preset === "this_month") {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
      dateTo   = now.toISOString().slice(0,10);
    } else {
      // today
      dateFrom = dateTo = now.toISOString().slice(0,10);
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

  const fromTs = `${dateFrom} 00:00:00`;
  const toTs   = `${dateTo}   23:59:59`;

  let openReq, salesOrders, dispatch, delivered,
      pendingPayments, totalAmount,
      recentOrders, pipeline,
      unsignedDocs, unreadContent,
      approvalStatus;
  try {
  [
    openReq, salesOrders, dispatch, delivered,
    pendingPayments, totalAmount,
    recentOrders, pipeline,
    unsignedDocs, unreadContent,
    approvalStatus
  ] = await Promise.all([
    // KPIs
    db.query(`SELECT COUNT(*) FROM sales_requests WHERE user_id=$1::uuid AND status IN ('CREATED','REQUEST_CREATED','Draft')`, [uid]),
    db.query(`SELECT COUNT(*) FROM sales_requests WHERE user_id=$1::uuid AND status='ORDER GENERATED' AND request_date BETWEEN $2 AND $3`, [uid, fromTs, toTs]),
    db.query(`SELECT COUNT(*) FROM sales_requests WHERE user_id=$1::uuid AND status='DELIVERY SCHEDULED' AND request_date BETWEEN $2 AND $3`, [uid, fromTs, toTs]),
    db.query(`SELECT COUNT(*) FROM sales_requests WHERE user_id=$1::uuid AND status='COMPLETED' AND request_date BETWEEN $2 AND $3`, [uid, fromTs, toTs]),
    db.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales_requests WHERE user_id=$1::uuid AND status IN ('CREATED','REQUEST_CREATED','Draft')`, [uid]),
    db.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales_requests WHERE user_id=$1::uuid AND request_date BETWEEN $2 AND $3`, [uid, fromTs, toTs]),
    // Recent orders
    db.query(`SELECT sr.drop_request_id AS request_no, DATE(sr.request_date) AS date,
                     (SELECT COUNT(*) FROM sales_request_items sri WHERE sri.drop_request_id=sr.drop_request_id) AS products_count,
                     sr.status, sr.erp_order_no AS so_number,
                     sr.request_date AS delivery_date, sr.total_amount AS amount
              FROM sales_requests sr WHERE sr.user_id=$1::uuid
              ORDER BY sr.request_date DESC LIMIT 10`, [uid]),
    // Pipeline counts ALL time
    db.query(`SELECT status, COUNT(*) FROM sales_requests WHERE user_id=$1::uuid GROUP BY status`, [uid]),
    // Unsigned legal documents
    db.query(`SELECT c.id AS content_id, c.title, ld.id AS legal_doc_id
              FROM content c
              JOIN legal_documents ld ON ld.id=c.legal_document_id
              WHERE c.type='DOCUMENT'
              AND EXISTS (SELECT 1 FROM content_targets ct WHERE ct.content_id=c.id AND (ct.target_value=$1::text OR ct.target_value=( SELECT role_id::text FROM user_roles WHERE user_id=$1::uuid LIMIT 1) OR ct.target_type='ALL'))
              AND NOT EXISTS (SELECT 1 FROM user_signed_documents usd WHERE usd.user_id=$1::uuid AND usd.legal_document_id=ld.id)
              LIMIT 5`, [uid]),
    // Recent content (offers, announcements, messages) targeted to this user
    db.query(`SELECT c.id, c.title, c.type, c.message, c.priority, c.created_at
              FROM content c
              JOIN content_targets ct ON ct.content_id=c.id
              WHERE c.type IN ('OFFER','ANNOUNCEMENT','MESSAGE')
              AND (ct.target_value=$1::text OR ct.target_type='ALL'
                   OR ct.target_value IN (SELECT role_id::text FROM user_roles WHERE user_id=$1::uuid))
              AND c.created_at >= NOW() - INTERVAL '30 days'
              ORDER BY c.created_at DESC LIMIT 8`, [uid]),
    // Account status
    db.query(`SELECT status FROM users WHERE user_id=$1::uuid`, [uid]),
  ]);
  } catch (qErr) {
    console.error('Dashboard query error:', qErr.message);
    // Return safe empty state instead of crashing
    return {
      kpis: { open_requests:0, sales_orders:0, orders_in_dispatch:0, delivered:0, pending_payments:0, total_amount:0 },
      pipeline: [], recent_orders: [], pending_actions: [], notifications: [],
      unsigned_docs: [], unread_content: [], account_status: 'active',
      _error: qErr.message
    };
  }

  // Build pipeline stages
  const statusMap = {};
  for (const r of pipeline.rows) statusMap[r.status] = Number(r.count);
  const pipelineStages = [
    { stage: "request_raised", label: "Request Raised",       count: statusMap["CREATED"] || 0 },
    { stage: "under_review",   label: "Under Review",         count: statusMap["Processing"] || 0 },
    { stage: "so_created",     label: "Approved / SO Created",count: statusMap["Order Generated"] || 0 },
    { stage: "in_dispatch",    label: "In Dispatch",          count: statusMap["Delivery Scheduled"] || 0 },
    { stage: "delivered",      label: "Delivered",            count: statusMap["Completed"] || 0 },
  ];

  // Build pending actions
  const pendingActions = [];
  const unsignedCount = unsignedDocs.rows.length;
  if (unsignedCount > 0)
    pendingActions.push({ key: "unsigned_docs", label: "Documents to Sign", count: unsignedCount, icon: "pen", path: "/inbox" });
  if (Number(openReq.rows[0].count) > 0)
    pendingActions.push({ key: "open_requests", label: "Open Order Requests", count: Number(openReq.rows[0].count), icon: "clock", path: "/sales-requests" });
  if (Number(pendingPayments.rows[0].total) > 0)
    pendingActions.push({ key: "payments_due", label: "Payments Due", count: null, icon: "credit-card", path: "/payments",
      amount: Number(pendingPayments.rows[0].total) });

  // Build notifications from unread content
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
      sales_orders:            Number(salesOrders.rows[0].count),
      orders_in_dispatch:      Number(dispatch.rows[0].count),
      delivered_orders:        Number(delivered.rows[0].count),
      pending_payments_amount: Number(pendingPayments.rows[0].total),
      total_amount:            Number(totalAmount.rows[0].total),
      currency: "USD",
    },
    pipeline: pipelineStages,
    pending_actions: pendingActions,
    notifications,
    recent_orders: recentOrders.rows,
  };
};
