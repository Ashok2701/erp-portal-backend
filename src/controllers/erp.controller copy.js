const { getERPAdapterForUser } = require("../erp/erp.factory");

exports.getCustomers = async (req, res) => {
  try {
    const adapter = await getERPAdapterForUser(req.user);
    res.json(await adapter.getCustomers());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSuppliers = async (req, res) => {
  try {
    const adapter = await getERPAdapterForUser(req.user);
    res.json(await adapter.getSuppliers());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const adapter = await getERPAdapterForUser(req.user);
    res.json(await adapter.getProducts());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCustomerAddresses = async (req, res) => {
  try {
    const adapter = await getERPAdapterForUser(req.user);
    res.json(await adapter.getCustomerAddresses(req.params.code));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const adapter = await getERPAdapterForUser(req.user);
    res.json(await adapter.getDashboardData(req.user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};