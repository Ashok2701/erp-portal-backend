const axios = require("axios");

const SAGE_BASE_URL = process.env.SAGE_X3_API_URL;
const TOKEN = process.env.SAGE_X3_TOKEN;

exports.fetchCustomers = async () => {
  const res = await axios.get(`${SAGE_BASE_URL}/customers`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return res.data;
};

exports.fetchSuppliers = async () => {
  const res = await axios.get(`${SAGE_BASE_URL}/suppliers`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return res.data;
};

exports.fetchProducts = async () => {
  const res = await axios.get(`${SAGE_BASE_URL}/products`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return res.data;
};

exports.fetchCustomerAddresses = async (customerCode) => {
  const res = await axios.get(`${SAGE_BASE_URL}/customers/${customerCode}/addresses`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return res.data;
};

exports.fetchDashboard = async (userContext) => {
  return {
    totalOrders: 12,
    openInvoices: 5,
    pendingDeliveries: 3
  };
};
