const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getAllInvoices(user);
};

exports.getById = async (id, user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getInvoiceDetail(id, user);
};

exports.getPending = async (user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getPendingInvoices(user);
};