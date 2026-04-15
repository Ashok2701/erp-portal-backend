// utils/erpContext.js

const UserModel = require("../models/user.model");

async function resolveCustomerCode(req) {
  const { user } = req;

  // 🔹 1. Frontend filter
  if (req.query.customer_code) {
    return req.query.customer_code;
  }

  // 🔹 2. Customer login → auto map
  if (user.role === "customer") {
    const userInfo = await UserModel.getUserById(user.user_id);
    return userInfo[0].erp_entity_code;
  }

  // 🔹 3. Sales rep → must select
  if (user.role === "salesrep") {
    throw new Error("customer_code is required for salesrep");
  }

  // 🔹 4. Admin → no filter
  return null;
}

module.exports = { resolveCustomerCode };