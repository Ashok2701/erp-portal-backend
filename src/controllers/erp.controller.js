const erpService = require("../services/erp.service");

exports.getCustomers = async (req, res) => {

  const customers = await erpService.getCustomers();

  res.json(customers);
};

exports.getSuppliers = async (req, res) => {

  const suppliers = await erpService.getSuppliers();

  res.json(suppliers);
};

exports.getProducts = async (req, res) => {

  const customers = await erpService.getCustomers();

  res.json(customers);
};

exports.getCustomerAddresses = async (req, res) => {

  const customerAddress = await erpService.getCustomers();

  res.json(customerAddress);
};

exports.getDashboard = async (req, res) => {

  const customers = await erpService.getCustomers();

  res.json(customers);
};

exports.getProducts = async (req, res) => {
  try {
   // const tenantId = req.user.tenantId;

    const filters = req.query;

    const data = await erpService.getProducts(filters);

    res.json({ success: true, data });
  } catch (error) {
    console.error("getProducts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProductCategories = async (req, res) => {
  try {
   // const tenantId = req.user.tenantId;

    const data = await erpService.getProductCategories();

    res.json({ success: true, data });
  } catch (error) {
    console.error("getProductCategories error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};