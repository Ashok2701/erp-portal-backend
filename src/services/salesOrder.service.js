const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (req) => {
  const adapter = ERPFactory.getERPAdapterForUser(user);
  return adapter.getAllOrders(req);
};

exports.getById = async (id, user) => {
  const adapter = ERPFactory.getERPAdapterForUser(user);
  return adapter.getOrderDetail(id, user);
};