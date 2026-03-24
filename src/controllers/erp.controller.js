const erpService = require("../services/erp.service");

exports.getCustomers = async (req, res) => {

  const customers = await erpService.getCustomers();

  res.json(customers);
};

exports.getSuppliers = async (req, res) => {

  const suppliers = await erpService.getSuppliers();

  res.json(suppliers);
};

exports.getProducts11 = async (req, res) => {

  const customers = await erpService.getCustomers();

  res.json(customers);
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

exports.getCustomerAddresses = async (req, res) => {
  try {
    const { customerCode } = req.params;

    const data = await erpService.getCustomerAddresses(customerCode);

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSupplierAddresses = async (req, res) => {
  try {
    const { supplierCode } = req.params;

    const data = await erpService.getSupplierAddresses(supplierCode);

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};