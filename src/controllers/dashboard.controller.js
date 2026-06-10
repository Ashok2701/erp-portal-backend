const service = require("../services/dashboard.service");
const db      = require("../config/db");

exports.getAdminStats = async (req, res) => {
  try {
    const data = await service.getAdminStats(req.user);

    res.json({ success: true, data });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── Customer stats for Dashboard.jsx (/dashboard/stats) ──────
// Returns: total_orders, pending_orders, confirmed_orders, 
//          scheduled_orders, delivered_orders, total_revenue
exports.getCustomerStats = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const [ordersRes, revenueRes] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*) as count
         FROM sales_requests
         WHERE user_id = $1
         GROUP BY status`,
        [user_id]
      ),
      db.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total
         FROM sales_requests
         WHERE user_id = $1`,
        [user_id]
      ),
    ]);

    const byStatus = {};
    for (const row of ordersRes.rows) {
      byStatus[row.status?.toLowerCase()] = Number(row.count);
    }

    const total_orders     = ordersRes.rows.reduce((s, r) => s + Number(r.count), 0);
    const total_revenue    = Number(revenueRes.rows[0]?.total || 0);

    res.json({
      success: true,
      data: {
        total_orders,
        pending_orders:   byStatus['created']           || 0,
        confirmed_orders: byStatus['order generated']   || 0,
        scheduled_orders: byStatus['delivery scheduled']|| 0,
        delivered_orders: byStatus['completed']         || 0,
        today_ready:      (byStatus['order generated'] || 0) + (byStatus['delivery scheduled'] || 0),
        total_revenue,
      }
    });
  } catch (err) {
    console.error("Customer stats error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCustomerDashboard = async (req, res) => {

  try {

    const {
      username,
      from,
      to,
      preset
    } = req.query;

    const data =
      await service.getCustomerDashboard({
        username,
        from,
        to,
        preset,
        user: req.user
      });

    res.json({
      success: true,
      data
    });

  } catch (err) {

    console.error("CUSTOMER DASHBOARD ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};