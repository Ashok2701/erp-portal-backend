const erpService = require("../services/erp.service");

exports.getCustomers = async (req, res) => {
  try {
    // filter_mode: 'email' | 'domain' | 'all'
    // user_email: email of the portal user being linked
    const mode  = req.query.filter_mode || 'all';
    const email = req.query.user_email  || '';
    const domain = email.includes('@') ? email.split('@')[1] : '';

    const filters = {};
    if (mode === 'email'  && email)  filters.emailFilter  = email;
    if (mode === 'domain' && domain) filters.domainFilter = domain;
    // mode === 'all' -> no filter (existing behaviour)

    const customers = await erpService.getCustomers(req.user, filters);
    res.json({ success: true, data: customers, meta: { mode, email, domain } });
  } catch (err) {
    console.error("getCustomers:", err.message);
    res.json({ success: true, data: [], warning: err.message });
  }
};

exports.getSuppliers = async (req, res) => {
  try {
    const suppliers = await erpService.getSuppliers(req.user);
    res.json({ success: true, data: suppliers });
  } catch (err) {
    console.error("getSuppliers:", err.message);
    res.json({ success: true, data: [], warning: err.message });
  }
};

exports.debugBlobSizes = async (req, res) => {
  try {
    const ERPFactoryLocal = require("../erp/erp.factory");
    const adapter = await ERPFactoryLocal.getERPAdapterForUser(req.user);
    const pool = await adapter.poolPromise;
    const sizeResult = await pool.request().query(`
      SELECT
        COUNT(*) AS row_count,
        SUM(DATALENGTH(BLOB_0)) AS total_bytes,
        AVG(DATALENGTH(BLOB_0)) AS avg_bytes,
        MAX(DATALENGTH(BLOB_0)) AS max_bytes
      FROM LEWISB.CBLOB WHERE CODBLB_0='ITM'
    `);

    const t0 = Date.now();
    await pool.request().query(`
      SELECT D.PROD_CODE, D.CATEGORY, D.PROD_DESC, D.UOM, D.SITE, 10 AS BASE_PRICE
      FROM (
        SELECT DISTINCT I.ITMREF_0 AS PROD_CODE, I.TCLCOD_0 AS CATEGORY, I.ITMDES1_0 AS PROD_DESC, I.STU_0 AS UOM, F.STOFCY_0 AS SITE
        FROM LEWISB.ITMMASTER I
        INNER JOIN LEWISB.ITMFACILIT F ON I.ITMREF_0 = F.ITMREF_0
        WHERE 1=1
      ) D
    `);
    const noBlobMs = Date.now() - t0;

    const t1 = Date.now();
    await pool.request().query(`
      SELECT D.PROD_CODE, D.CATEGORY, D.PROD_DESC, C.BLOB_0 AS PROD_IMG, D.UOM, D.SITE, 10 AS BASE_PRICE
      FROM (
        SELECT DISTINCT I.ITMREF_0 AS PROD_CODE, I.TCLCOD_0 AS CATEGORY, I.ITMDES1_0 AS PROD_DESC, I.STU_0 AS UOM, F.STOFCY_0 AS SITE
        FROM LEWISB.ITMMASTER I
        INNER JOIN LEWISB.ITMFACILIT F ON I.ITMREF_0 = F.ITMREF_0
        WHERE 1=1
      ) D
      LEFT JOIN LEWISB.CBLOB C ON D.PROD_CODE = C.IDENT1_0 AND C.CODBLB_0 = 'ITM'
    `);
    const withBlobMs = Date.now() - t1;

    res.json({ success: true, sizeResult: sizeResult.recordset[0], noBlobMs, withBlobMs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.debugProductsFull2 = async (req, res) => {
  const timings = {};
  const mark = async (label, fn) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      timings[label] = Date.now() - t0;
      return r;
    } catch (e) {
      timings[label] = Date.now() - t0;
      timings[label + "_error"] = e.message;
      throw e;
    }
  };
  try {
    const UserModel = require("../models/user.model");
    const userInfo = await mark("getUserById", () => UserModel.getUserById(req.user.user_id || req.user.id));
    const userSite = userInfo[0]?.allowedsite || null;
    const sitesParam = req.query.sites
      ? req.query.sites.split(",").map(s => s.trim())
      : (userSite ? userSite.split(",").map(s => s.trim()) : []);
    const filters = {
      customer: req.query.customer || null,
      sites: sitesParam,
      category: req.query.category || null,
      quantity: Number(req.query.quantity || 1)
    };

    const ERPFactoryLocal = require("../erp/erp.factory");
    const adapter = await mark("getAdapter", () => ERPFactoryLocal.getERPAdapterForUser(req.user));
    const products = await mark("getProducts", () => adapter.getProducts(filters));
    const priceLists = await mark("getPriceLists", () => adapter.getPriceLists(filters));

    res.json({ success: true, timings, filters, productCount: products.length, priceListCount: priceLists.length });
  } catch (err) {
    res.status(500).json({ success: false, timings, message: err.message });
  }
};

exports.getProducts11 = async (req, res) => {

  const customers = await erpService.getCustomers(req.user);

  res.json(customers);
};


exports.getDashboard = async (req, res) => {

  const customers = await erpService.getCustomers(req.user);

  res.json(customers);
};

exports.getProducts = async (req, res) => {
  try {
   // Auto-inject user's allowedSite if no sites param provided (B2C flow)
   const UserModel = require("../models/user.model");
   const userInfo  = await UserModel.getUserById(req.user.user_id || req.user.id);
   const userSite  = userInfo[0]?.allowedsite || null;

   const sitesParam = req.query.sites
     ? req.query.sites.split(",").map(s => s.trim())
     : (userSite ? userSite.split(",").map(s => s.trim()) : []);

   const filters = {
     customer: req.query.customer || null,
     sites:    sitesParam,
     category: req.query.category || null,
     quantity: Number(req.query.quantity || 1)
   };

    const data = await erpService.getProducts(filters, req.user);

    res.json({ success: true, data });
  } catch (error) {
    console.error("getProducts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProductCategories = async (req, res) => {
  try {
   // const tenantId = req.user.tenantId;

    const data = await erpService.getProductCategories(req.user);

    res.json({ success: true, data });
  } catch (error) {
    console.error("getProductCategories error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getConfigStatus = async (req, res) => {
  try {
    const TenantSettingsModel = require("../models/tenantSettings.model");
    const { tenant_id } = req.user;
    if (!tenant_id) return res.json({ success: true, data: { isReady: true, missing: [] } });
    const status = await TenantSettingsModel.getConfigStatus(tenant_id);
    res.json({ success: true, data: status });
  } catch (err) {
    console.error("getConfigStatus:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCustomerDetail = async (req, res) => {
  try {
    const { customerCode } = req.params;
    const adapter = await require("../erp/erp.factory").getERPAdapterForUser(req.user);
    const data = await adapter.getCustomerDetail(customerCode);
    if (!data) return res.status(404).json({ success: false, message: "Customer not found" });
    res.json({ success: true, data });
  } catch (err) {
    console.error("getCustomerDetail:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCustomerAddresses = async (req, res) => {
  try {
    const { customerCode } = req.params;

    const data = await erpService.getCustomerAddresses(customerCode, req.user);

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSupplierAddresses = async (req, res) => {
  try {
    const { supplierCode } = req.params;

    const data = await erpService.getSupplierAddresses(supplierCode, req.user);

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.getStock = async (req, res) => {
  try {
    const filters = req.query;

    const data = await erpService.getStock(filters, req.user);

    res.json({ success: true, data });
  } catch (err) {
    console.error("getStock error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllSites = async (req, res) => {
  try {
    const filters = req.query;

    const data = await erpService.getAllSites(req.user);

    res.json({ success: true, data });
  } catch (err) {
    console.error("getAllSites error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
// ── CONSIGNMENT CONSUMPTION ──────────────────────────────────
exports.recordConsumption = async (req, res) => {
  try {
    const { product_code, quantity, site, note } = req.body;
    if (!product_code || !quantity)
      return res.status(400).json({ success: false, message: "product_code and quantity required" });

    const result = await require("../config/db").query(
      `INSERT INTO consignment_consumption
         (tenant_id, user_id, customer_code, product_code, quantity, site, note, consumed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       RETURNING *`,
      [req.user.tenant_id, req.user.user_id,
       req.user.erp_entity_code, product_code,
       parseFloat(quantity), site || null, note || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("RECORD CONSUMPTION ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── REPLENISHMENT REQUEST ────────────────────────────────────
exports.requestReplenishment = async (req, res) => {
  try {
    const { product_code, quantity, site, notes } = req.body;
    if (!product_code || !quantity)
      return res.status(400).json({ success: false, message: "product_code and quantity required" });

    const result = await require("../config/db").query(
      `INSERT INTO replenishment_requests
         (tenant_id, user_id, customer_code, product_code, quantity, site, notes, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',NOW())
       RETURNING *`,
      [req.user.tenant_id, req.user.user_id,
       req.user.erp_entity_code, product_code,
       parseFloat(quantity), site || null, notes || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("REPLENISHMENT ERROR:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ACCOUNT STATEMENT ────────────────────────────────────────
exports.getStatement = async (req, res) => {
  try {
    const adapter      = await require("../erp/erp.factory").getERPAdapterForUser(req.user);
    const customerCode = req.user.erp_entity_code || req.user.erp_customer_code;
    if (!customerCode)
      return res.status(400).json({ success: false, message: "No customer code on account" });

    // Get all invoices and payments from X3
    const [invoices, payments] = await Promise.all([
      adapter.getAllInvoices(req),
      adapter.getAllPayments(req),
    ]);

    const totalInvoiced = invoices.reduce((s, i) =>
      s + parseFloat(i.AMTATI_0 || i.TOTATI_0 || i.total_amount || 0), 0);
    const totalPaid = payments.reduce((s, p) =>
      s + parseFloat(p.AMTCUR_0 || p.amount || 0), 0);

    res.json({
      success: true,
      data: {
        customer_code: customerCode,
        total_invoiced: totalInvoiced,
        total_paid:     totalPaid,
        balance_due:    totalInvoiced - totalPaid,
        invoices,
        payments,
      }
    });
  } catch (err) {
    if (err.code === "ERP_NOT_CONFIGURED")
      return res.status(503).json({ success: false, message: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CONSIGNMENT DASHBOARD KPIs ────────────────────────────────
exports.getConsignmentDashboard = async (req, res) => {
  try {
    const db           = require("../config/db");
    const { tenant_id, user_id } = req.user;

    const [consumed, replenish] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(quantity),0) AS total, COUNT(*) AS count
         FROM consignment_consumption
         WHERE tenant_id=$1 AND user_id=$2
           AND consumed_at >= DATE_TRUNC('month', NOW())`,
        [tenant_id, user_id]
      ),
      db.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status='PENDING') AS pending
         FROM replenishment_requests
         WHERE tenant_id=$1 AND user_id=$2`,
        [tenant_id, user_id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        consumed_this_month: Number(consumed.rows[0]?.total || 0),
        consumption_records: Number(consumed.rows[0]?.count || 0),
        replenishment_total:   Number(replenish.rows[0]?.total   || 0),
        replenishment_pending: Number(replenish.rows[0]?.pending  || 0),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
