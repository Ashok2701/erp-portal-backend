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

  const customers = await erpService.getCustomers();

  res.json(customers);
};

exports.getDashboard = async (req, res) => {

  const customers = await erpService.getCustomers();

  res.json(customers);
};
