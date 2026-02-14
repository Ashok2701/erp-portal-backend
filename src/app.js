const express = require("express");
const cors = require("cors");


const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const salesRequestRoutes = require("./routes/salesRequest.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes); 
app.use("/admin", adminRoutes);
app.use("/sales-requests", salesRequestRoutes);
app.use("/modules", require("./routes/module.routes"));



module.exports = app;