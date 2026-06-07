const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (req) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getAllDeliveries(req);
};

exports.getById = async (id, user) => {
  const adapter = await ERPFactory.getERPAdapterForUser(user);
  return adapter.getDeliveryDetail(id, user);
};