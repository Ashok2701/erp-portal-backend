const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getAllOrders(user);
};

exports.getById = async (id, user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getOrderDetail(id, user);
};