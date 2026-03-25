const ERPFactory = require("../erp/erp.factory");

exports.getAll = async (user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getAllPayments(user);
};

exports.getById = async (id, user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getPaymentDetail(id, user);
};

exports.getPendingInvoices = async (user) => {
  const adapter = ERPFactory.getERPAdapter();
  return adapter.getPaymentPendingInvoices(user);
};