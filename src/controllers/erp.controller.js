const erpService = require("../services/erp.service");

exports.getCustomers = async (req, res) => {

  const customers = await erpService.getCustomers(req.user);

  res.json(customers);
};

exports.getSuppliers = async (req, res) => {

  const suppliers = await erpService.getSuppliers(req.user);

  res.json(suppliers);
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
     : (userSite ? [userSite] : []);

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