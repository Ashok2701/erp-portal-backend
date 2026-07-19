"use strict";
const db      = require("../config/db");
const factory = require("../erp/erp.factory");

// Helper — get supplier code for current user
function getSupplierCode(user) {
  return user?.erp_entity_code || user?.erp_supplier_code || null;
}

// ── PURCHASE ORDERS ──────────────────────────────────────────
exports.listPurchaseOrders = async (req, res) => {
  try {
    const adapter      = await factory.getERPAdapterForUser(req.user);
    const supplierCode = getSupplierCode(req.user);
    if (!supplierCode)
      return res.status(400).json({ success: false, message: "No supplier code linked to your account" });

    const orders = await adapter.getAllPurchaseOrders(supplierCode);

    // Merge any portal actions (accept/reject/ASN) stored in our DB
    const actions = await db.query(
      `SELECT po_number, action, reason, asn_data, actioned_at, u.username
       FROM purchase_order_actions poa
       LEFT JOIN users u ON u.user_id = poa.user_id
       WHERE poa.tenant_id = $1`,
      [req.user.tenant_id]
    );
    const actionMap = {};
    for (const a of actions.rows) actionMap[a.po_number] = a;

    const enriched = orders.map(po => ({
      ...po,
      portal_action: actionMap[po.po_number] || null,
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error("LIST POs ERROR:", err.message);
    if (err.code === "ERP_NOT_CONFIGURED")
      return res.status(503).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPurchaseOrderDetail = async (req, res) => {
  try {
    const { poNumber } = req.params;
    const adapter = await factory.getERPAdapterForUser(req.user);
    const po = await adapter.getPurchaseOrderDetail(poNumber);
    if (!po) return res.status(404).json({ success: false, message: "PO not found" });

    // Get any portal action
    const action = await db.query(
      `SELECT * FROM purchase_order_actions WHERE po_number=$1 AND tenant_id=$2`,
      [poNumber, req.user.tenant_id]
    );
    po.portal_action = action.rows[0] || null;

    // Get ASN submissions
    const asn = await db.query(
      `SELECT * FROM asn_submissions WHERE po_number=$1 AND tenant_id=$2 ORDER BY created_at DESC`,
      [poNumber, req.user.tenant_id]
    );
    po.asn_submissions = asn.rows;

    res.json({ success: true, data: po });
  } catch (err) {
    console.error("PO DETAIL ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ACCEPT PO ─────────────────────────────────────────────────
exports.acceptPurchaseOrder = async (req, res) => {
  try {
    const { poNumber } = req.params;
    const { note } = req.body;

    await db.query(
      `INSERT INTO purchase_order_actions
         (po_number, tenant_id, user_id, action, reason, actioned_at)
       VALUES ($1,$2,$3,'ACCEPTED',$4,NOW())
       ON CONFLICT (po_number, tenant_id)
       DO UPDATE SET action='ACCEPTED', reason=$4, actioned_at=NOW(), user_id=$3`,
      [poNumber, req.user.tenant_id, req.user.user_id, note || null]
    );

    res.json({ success: true, message: `PO ${poNumber} accepted` });
  } catch (err) {
    console.error("ACCEPT PO ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── REJECT PO ─────────────────────────────────────────────────
exports.rejectPurchaseOrder = async (req, res) => {
  try {
    const { poNumber } = req.params;
    const { reason } = req.body;
    if (!reason?.trim())
      return res.status(400).json({ success: false, message: "Rejection reason is required" });

    await db.query(
      `INSERT INTO purchase_order_actions
         (po_number, tenant_id, user_id, action, reason, actioned_at)
       VALUES ($1,$2,$3,'REJECTED',$4,NOW())
       ON CONFLICT (po_number, tenant_id)
       DO UPDATE SET action='REJECTED', reason=$4, actioned_at=NOW(), user_id=$3`,
      [poNumber, req.user.tenant_id, req.user.user_id, reason]
    );

    res.json({ success: true, message: `PO ${poNumber} rejected` });
  } catch (err) {
    console.error("REJECT PO ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ASN (Advance Shipment Notice) ─────────────────────────────
exports.submitASN = async (req, res) => {
  try {
    const { poNumber } = req.params;
    const { expected_date, lines, tracking_number, carrier } = req.body;
    if (!expected_date)
      return res.status(400).json({ success: false, message: "Expected delivery date is required" });

    const result = await db.query(
      `INSERT INTO asn_submissions
         (po_number, tenant_id, user_id, expected_date, tracking_number, carrier, lines, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       RETURNING *`,
      [poNumber, req.user.tenant_id, req.user.user_id,
       expected_date, tracking_number || null, carrier || null,
       JSON.stringify(lines || [])]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("ASN ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── INVOICE UPLOAD ────────────────────────────────────────────
exports.uploadInvoice = async (req, res) => {
  try {
    const { poNumber } = req.params;
    if (!req.file)
      return res.status(400).json({ success: false, message: "Invoice file required" });

    const fileUrl = req.file.location || req.file.path || "";
    const { invoice_number, invoice_date, amount } = req.body;

    const result = await db.query(
      `INSERT INTO supplier_invoices
         (po_number, tenant_id, user_id, invoice_number, invoice_date,
          amount, file_url, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SUBMITTED',NOW())
       RETURNING *`,
      [poNumber, req.user.tenant_id, req.user.user_id,
       invoice_number || null, invoice_date || null,
       parseFloat(amount) || 0, fileUrl]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("UPLOAD INVOICE ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SUPPLIER CONSIGNMENT ──────────────────────────────────────
exports.getSupplierConsignment = async (req, res) => {
  try {
    const adapter      = await factory.getERPAdapterForUser(req.user);
    const supplierCode = getSupplierCode(req.user);
    if (!supplierCode)
      return res.status(400).json({ success: false, message: "No supplier code on account" });

    const data = await adapter.getSupplierConsignment(supplierCode);
    res.json({ success: true, data });
  } catch (err) {
    if (err.code === "ERP_NOT_CONFIGURED")
      return res.status(503).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SUPPLIER DASHBOARD KPIs ───────────────────────────────────
exports.getSupplierDashboard = async (req, res) => {
  try {
    const { tenant_id, user_id } = req.user;

    const [poActions, asnCount, invoices] = await Promise.all([
      db.query(
        `SELECT action, COUNT(*) AS count
         FROM purchase_order_actions
         WHERE tenant_id=$1 AND user_id=$2
         GROUP BY action`,
        [tenant_id, user_id]
      ),
      db.query(
        `SELECT COUNT(*) AS count FROM asn_submissions
         WHERE tenant_id=$1 AND user_id=$2`,
        [tenant_id, user_id]
      ),
      db.query(
        `SELECT status, COUNT(*) AS count, SUM(amount) AS total
         FROM supplier_invoices
         WHERE tenant_id=$1 AND user_id=$2
         GROUP BY status`,
        [tenant_id, user_id]
      ),
    ]);

    const actionMap = {};
    for (const r of poActions.rows) actionMap[r.action] = Number(r.count);

    const invoiceMap = {};
    for (const r of invoices.rows) invoiceMap[r.status] = { count: Number(r.count), total: Number(r.total) };

    res.json({
      success: true,
      data: {
        po_accepted:       actionMap.ACCEPTED || 0,
        po_rejected:       actionMap.REJECTED || 0,
        asn_submitted:     Number(asnCount.rows[0]?.count || 0),
        invoices_submitted: invoiceMap.SUBMITTED?.count || 0,
        invoices_approved:  invoiceMap.APPROVED?.count  || 0,
        invoices_paid:      invoiceMap.PAID?.count      || 0,
        total_invoiced:     Object.values(invoiceMap).reduce((s,v) => s + (v.total||0), 0),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
