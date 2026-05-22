const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (req) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getAllDeliveries(req);
};

exports.getById = async (id, user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getDeliveryDetail(id, user);
};