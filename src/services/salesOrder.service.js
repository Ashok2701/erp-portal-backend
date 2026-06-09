const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (req) => {
  const adapter = await ERPFactory.getERPAdapterForUser(req.user);
  return adapter.getAllOrders(req);
};

exports.getById = async (id, user) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getOrderDetail(id, user);
};