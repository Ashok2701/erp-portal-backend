const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (user) => {
  const adapter = ERPFactory.getERPAdapterForUser(user);
  return adapter.getAllPayments(user);
};

exports.getById = async (id, user) => {
  const adapter = ERPFactory.getERPAdapterForUser(user);
  return adapter.getPaymentDetail(id, user);
};

exports.getPendingInvoices = async (user) => {
  const adapter = ERPFactory.getERPAdapterForUser(user);
  return adapter.getPaymentPendingInvoices(user);
};