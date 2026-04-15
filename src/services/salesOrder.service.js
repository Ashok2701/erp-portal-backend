const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (req) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getAllOrders(req);
};

exports.getById = async (id, user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getOrderDetail(id, user);
};