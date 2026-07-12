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
    logger.info("Supplier/consignment tables ready");
  } catch (err) {
    logger.error("Table creation error:", { message: err.message });
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
app.use("/supplier",       require("./routes/supplier.routes"));
app.use("/cart",           require("./routes/cart.routes"));
app.use("/profile",        require("./routes/profile.routes"));
app.use("/api/chat",       require("./routes/chat.routes"));           // keep /api/chat prefix
app.use("/chat",           require("./routes/chat.routes"));           // also serve without prefix

// ── 404 + Global error handler (must be last) ─────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
