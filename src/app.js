const express = require("express");
const cors = require("cors");
const cartRoutes = require("./routes/cart.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const profileRoutes = require("./routes/profile.routes");
const salesRequestRoutes = require("./routes/salesRequest.routes");
const roleModuleRoutes = require("./routes/roleModule.routes");
const chatRoutes = require("./routes/chat.routes");
const salesQuoteRoutes = require("./routes/salesQuote.routes");
const salesOrderRoutes = require("./routes/salesOrder.routes");
const salesInvoiceRoutes = require("./routes/salesInvoice.routes");
const PaymentRoutes = require("./routes/payment.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const contentRoutes = require("./routes/content.routes");
const signupRoutes = require("./routes/signup.routes");
const documentsRoutes = require("./routes/documents.routes");
const salesDeliveries = require("./routes/salesDeliveries.routes");
const inventoryRoutes   = require("./routes/inventory.routes");
const superadminRoutes  = require("./routes/superadmin.routes");
const maintenanceRoutes = require("./routes/maintenance.routes");
const partnerRoutes     = require("./routes/partner.routes");

const app = express();

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = [
      process.env.FRONTEND_URL,
      'https://shark-app-tt8ea.ondigitalocean.app',
      'http://localhost:3000',
      'http://localhost:3001',
    ].filter(Boolean);
    if (allowed.some(u => origin.startsWith(u))) return callback(null, true);
    callback(new Error('CORS: origin not allowed: ' + origin));
  },
  credentials: true,
}));
app.use(express.json());

app.use("/auth", authRoutes); 
app.use("/admin", adminRoutes);
app.use("/profile", profileRoutes);
app.use("/sales-requests", salesRequestRoutes);
app.use("/modules", require("./routes/module.routes"));
app.use("/roles", require("./routes/role.routes"));
app.use("/role-modules", roleModuleRoutes);
app.use("/erp", require("./routes/erp.routes"));
app.use("/api/chat", chatRoutes);
app.use("/cart", cartRoutes);
app.use("/", signupRoutes);
app.use("/", documentsRoutes);
app.use("/orders", salesOrderRoutes);

app.use("/sinvoice", salesInvoiceRoutes);
app.use("/squote", salesQuoteRoutes);
app.use("/deliveries", salesDeliveries);
app.use("/payment", PaymentRoutes);

app.use("/content", contentRoutes);

app.use("/dashboard", dashboardRoutes);
app.use("/inventory",       inventoryRoutes);
app.use("/erp/inventory",   inventoryRoutes);  // alias — frontend uses /erp/inventory
app.use("/maintenance",  maintenanceRoutes);
app.use("/credit-notes", require("./routes/creditNotes.routes"));
app.use("/superadmin",  superadminRoutes);
app.use("/partners",    partnerRoutes);        // 3-tier: partner/reseller management

// Auto-migration: add erp_delivery_no column if not exists
const db = require('./config/db');
db.query(`ALTER TABLE sales_requests ADD COLUMN IF NOT EXISTS erp_delivery_no VARCHAR(100)`).catch(e => console.warn('Migration:', e.message));
db.query(`ALTER TABLE sales_requests ADD COLUMN IF NOT EXISTS customer_notes TEXT`).catch(e => console.warn('Migration:', e.message));

module.exports = app;
