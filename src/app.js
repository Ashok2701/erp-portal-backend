const express = require("express");
const cors = require("cors");
const cartRoutes = require("./routes/cart.routes");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const salesRequestRoutes = require("./routes/salesRequest.routes");
const roleModuleRoutes = require("./routes/roleModule.routes");
const chatRoutes = require("./routes/chat.routes");
const salesQuoteRoutes = require("./routes/salesQuote.routes");
const salesOrderRoutes = require("./routes/salesOrder.routes");
const salesInvoiceRoutes = require("./routes/salesInvoice.routes");
const PaymentRoutes = require("./routes/payment.routes");
const dashboardRoutes = require("./routes/dashboard.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes); 
app.use("/admin", adminRoutes);
app.use("/sales-requests", salesRequestRoutes);
app.use("/modules", require("./routes/module.routes"));
app.use("/roles", require("./routes/role.routes"));
app.use("/role-modules", roleModuleRoutes);
app.use("/erp", require("./routes/erp.routes"));
app.use("/api/chat", chatRoutes);
app.use("/cart", cartRoutes);

app.use("/orders", salesOrderRoutes);
app.use("/sinvoice", salesInvoiceRoutes);
app.use("/squote", salesQuoteRoutes);
app.use("/payment", PaymentRoutes);



app.use("/dashboard", dashboardRoutes);

module.exports = app;