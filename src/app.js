"use strict";
const express  = require("express");
const cors     = require("cors");
const crypto   = require("crypto");
const logger   = require("./utils/logger");
const { globalErrorHandler, notFoundHandler } = require("./middleware/errorHandler.middleware");

const app = express();

// ── Request ID ──────────────────────────────────────────────
app.use((req, _res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  next();
});

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = [
      process.env.FRONTEND_URL,
      "https://shark-app-tt8ea.ondigitalocean.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ].filter(Boolean);
    if (allowed.some(u => origin.startsWith(u))) return cb(null, true);
    cb(new Error(`CORS: origin not allowed: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// ── Request logger (dev only) ────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`, { reqId: req.id });
    next();
  });
}

// ── Health check ─────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ── Auto-create supplier/consignment tables ───────────────────
(async () => {
  const db = require("./config/db");
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_actions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        po_number   VARCHAR(50)  NOT NULL,
        tenant_id   UUID         NOT NULL,
        user_id     UUID,
        action      VARCHAR(20)  NOT NULL CHECK (action IN ('ACCEPTED','REJECTED')),
        reason      TEXT,
        asn_data    JSONB,
        actioned_at TIMESTAMPTZ  DEFAULT NOW(),
        UNIQUE(po_number, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS asn_submissions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        po_number       VARCHAR(50)  NOT NULL,
        tenant_id       UUID         NOT NULL,
        user_id         UUID,
        expected_date   DATE,
        tracking_number VARCHAR(100),
        carrier         VARCHAR(100),
        lines           JSONB,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS supplier_invoices (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        po_number       VARCHAR(50),
        tenant_id       UUID         NOT NULL,
        user_id         UUID,
        invoice_number  VARCHAR(100),
        invoice_date    DATE,
        amount          NUMERIC(18,4) DEFAULT 0,
        file_url        TEXT,
        status          VARCHAR(20) DEFAULT 'SUBMITTED'
                        CHECK (status IN ('SUBMITTED','APPROVED','REJECTED','PAID')),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS consignment_consumption (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID         NOT NULL,
        user_id       UUID,
        customer_code VARCHAR(50),
        product_code  VARCHAR(50)  NOT NULL,
        quantity      NUMERIC(18,4) NOT NULL,
        site          VARCHAR(20),
        note          TEXT,
        consumed_at   TIMESTAMPTZ  DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS replenishment_requests (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID         NOT NULL,
        user_id       UUID,
        customer_code VARCHAR(50),
        product_code  VARCHAR(50)  NOT NULL,
        quantity      NUMERIC(18,4) NOT NULL,
        site          VARCHAR(20),
        notes         TEXT,
        status        VARCHAR(20)  DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','APPROVED','FULFILLED','REJECTED')),
        created_at    TIMESTAMPTZ  DEFAULT NOW()
      );
    `);
    // Purchase request tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS purchase_requests (
        purchase_request_id  VARCHAR(20)   PRIMARY KEY,
        tenant_id            UUID          NOT NULL,
        user_id              UUID,
        supplier_code        VARCHAR(50),
        site                 VARCHAR(20),
        currency             VARCHAR(10)   DEFAULT 'USD',
        reference            VARCHAR(100),
        comment              TEXT,
        total_amount         NUMERIC(18,4) DEFAULT 0,
        total_qty            NUMERIC(18,4) DEFAULT 0,
        status               VARCHAR(30)   DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING','APPROVED','REJECTED','CONVERTED')),
        erp_po_number        VARCHAR(50),
        request_date         DATE          DEFAULT CURRENT_DATE,
        created_at           TIMESTAMPTZ   DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS purchase_request_items (
        id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_request_id  VARCHAR(20)   NOT NULL REFERENCES purchase_requests(purchase_request_id),
        line_no              INTEGER,
        product_code         VARCHAR(50)   NOT NULL,
        prod_desc            TEXT,
        quantity             NUMERIC(18,4) NOT NULL,
        unit                 VARCHAR(20),
        price                NUMERIC(18,4) DEFAULT 0,
        line_amount          NUMERIC(18,4) DEFAULT 0
      );
      CREATE SEQUENCE IF NOT EXISTS purchase_request_seq START 1;
    `);
    logger.info("Supplier/consignment tables ready");
  } catch (err) {
    logger.error("Table creation error:", { message: err.message });
  }
})();

// ── Seed modules rows for pages built this session ────────────
// The `modules` table drives the dynamic sidebar (GET /auth/modules and
// PORTAL_MODULES filtering in portalGrant.model.js). It only ever had rows
// for the original Customer-only portal — the Supplier and Consignment
// pages/routes added this session (purchase-orders, raise-purchase-request,
// my-purchase-requests, the inventory sub-pages, consumption, replenishment,
// statement) never got corresponding rows, so those portals' sidebars
// rendered almost empty regardless of what PORTAL_MODULES listed. This is
// a one-time idempotent backfill (checks existing module_name first, since
// we don't have a guaranteed unique constraint to rely on ON CONFLICT).
(async () => {
  const db = require("./config/db");
  const newModules = [
    { name: "Overview",               path: "/inventory/overview",     icon: "box",        sort: 60 },
    { name: "Available",              path: "/inventory/availability", icon: "package",    sort: 61 },
    { name: "Consignment",            path: "/inventory/consignment",  icon: "box",        sort: 62 },
    { name: "In Transit",             path: "/inventory/in-transit",   icon: "truck",      sort: 63 },
    { name: "Reserved",               path: "/inventory/reserved",     icon: "shield",     sort: 64 },
    { name: "Stock Requests",         path: "/inventory/requests",     icon: "clipboard",  sort: 65 },
    { name: "Movements",              path: "/inventory/movements",    icon: "default",    sort: 66 },
    { name: "Consumption",            path: "/consumption",            icon: "default",    sort: 67 },
    { name: "Replenishment",          path: "/replenishment",          icon: "default",    sort: 68 },
    { name: "Account Statement",      path: "/statement",              icon: "file-text",  sort: 69 },
    { name: "Purchase Orders",        path: "/purchase-orders",        icon: "clipboard",  sort: 70 },
    { name: "Raise Purchase Request", path: "/raise-purchase-request", icon: "file-text",  sort: 71 },
    { name: "My Purchase Requests",   path: "/my-purchase-requests",   icon: "clipboard",  sort: 72 },
    { name: "Document Library",       path: "/admin/documents",        icon: "file-text",  sort: 73 },
  ];
  try {
    const existing = await db.query(
      `SELECT module_name FROM modules WHERE module_name = ANY($1)`,
      [newModules.map(m => m.name)]
    );
    const existingNames = new Set(existing.rows.map(r => r.module_name));
    for (const m of newModules) {
      if (existingNames.has(m.name)) continue;
      await db.query(
        `INSERT INTO modules (module_id, module_name, route_path, icon_name, is_active, sort_order)
         VALUES (gen_random_uuid(), $1, $2, $3, true, $4)`,
        [m.name, m.path, m.icon, m.sort]
      );
      logger.info(`Seeded module: ${m.name} -> ${m.path}`);
    }
  } catch (err) {
    logger.error("Module seed error:", { message: err.message });
  }

  // ── Portal <-> module mapping: make it configurable in SuperAdmin ──────
  // Previously this was a hardcoded PORTAL_MODULES map in portalGrant.model.js
  // that only a code change + redeploy could edit. Moves it into a real
  // table, editable from SuperAdmin > Portal Modules. Runs in the same IIFE
  // (after the module seed above, sequentially) because the default seed
  // below needs those module rows to already exist — two separate
  // fire-and-forget IIFEs would race.
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS portal_module_mapping (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        portal_type VARCHAR(20) NOT NULL,
        module_id   UUID NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
        is_active   BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE (portal_type, module_id)
      );
    `);

    // One-time seed from the lists this table replaces — only runs if the
    // table is empty, so it never overwrites changes made via the new UI.
    const countResult = await db.query(`SELECT COUNT(*)::int AS c FROM portal_module_mapping`);
    if (countResult.rows[0].c === 0) {
      const defaults = {
        CUSTOMER: [
          "Dashboard", "Products", "Orders", "Invoices", "Payments",
          "Deliveries", "Sales Requests", "Sales Quote", "Credit Notes",
          "Content Management",
        ],
        CONSIGNMENT: [
          "Dashboard", "Available", "Consignment", "In Transit", "Reserved",
          "Stock Requests", "Movements", "Overview", "Consumption",
          "Replenishment", "Account Statement", "Orders", "Invoices",
          "Payments", "Content Management",
        ],
        SUPPLIER: [
          "Dashboard", "Products", "Cart", "Purchase Orders",
          "Raise Purchase Request", "My Purchase Requests",
          "Document Library", "Content Management",
        ],
      };
      for (const [portalType, names] of Object.entries(defaults)) {
        const mods = await db.query(
          `SELECT module_id FROM modules WHERE module_name = ANY($1)`,
          [names]
        );
        for (const row of mods.rows) {
          await db.query(
            `INSERT INTO portal_module_mapping (portal_type, module_id, is_active)
             VALUES ($1,$2,true) ON CONFLICT DO NOTHING`,
            [portalType, row.module_id]
          );
        }
      }
      logger.info("Seeded portal_module_mapping from defaults");
    }
    logger.info("portal_module_mapping table ready");
  } catch (err) {
    logger.error("portal_module_mapping seed error:", { message: err.message });
  }
})();

// ── Routes ───────────────────────────────────────────────────
// Auth & signup
app.use("/auth",           require("./routes/auth.routes"));
app.use("/auth",           require("./routes/signup.routes"));   // POST /auth/signup

// Platform management (3-tier)
app.use("/partners",       require("./routes/partner.routes"));
app.use("/superadmin",     require("./routes/superadmin.routes"));

// Tenant admin
app.use("/admin",          require("./routes/admin.routes"));
app.use("/modules",        require("./routes/module.routes"));
app.use("/roles",          require("./routes/role.routes"));
app.use("/role-modules",   require("./routes/roleModule.routes"));
app.use("/content",        require("./routes/content.routes"));
app.use("/maintenance",    require("./routes/maintenance.routes"));

// Documents — mounted at root so /admin/legal-documents works
app.use("/",               require("./routes/documents.routes"));

// Dashboard
app.use("/dashboard",      require("./routes/dashboard.routes"));

// ERP data
app.use("/erp",            require("./routes/erp.routes"));
app.use("/inventory",      require("./routes/inventory.routes"));

// Sales — keep BOTH old and new paths for backward compat
app.use("/orders",         require("./routes/salesOrder.routes"));
app.use("/invoices",       require("./routes/salesInvoice.routes"));
app.use("/sinvoice",       require("./routes/salesInvoice.routes"));   // legacy alias
app.use("/quotes",         require("./routes/salesQuote.routes"));
app.use("/squote",         require("./routes/salesQuote.routes"));     // legacy alias
app.use("/deliveries",     require("./routes/salesDeliveries.routes"));
app.use("/payments",       require("./routes/payment.routes"));
app.use("/payment",        require("./routes/payment.routes"));        // legacy alias
app.use("/credit-notes",   require("./routes/creditNotes.routes"));
app.use("/sales-requests", require("./routes/salesRequest.routes"));

// Other
app.use("/purchase-requests", require("./routes/purchaseRequest.routes"));
app.use("/supplier",          require("./routes/supplier.routes"));
app.use("/cart",           require("./routes/cart.routes"));
app.use("/profile",        require("./routes/profile.routes"));
app.use("/api/chat",       require("./routes/chat.routes"));           // keep /api/chat prefix
app.use("/chat",           require("./routes/chat.routes"));           // also serve without prefix

// ── 404 + Global error handler (must be last) ─────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
