const SageX3Adapter = require("./sagex3/sagex3.adapter");
const ErpConnectionModel = require("../models/erpConnection.model");
const SageAdapter = require("./sagex3/sagex3.adapter");

exports.getERPAdapterForUser = async (user) => {
  const conn = await ErpConnectionModel.getByTenant(user.tenant_id);

  if (!conn) {
    throw new Error("ERP connection not configured");
  }

  switch (conn.erp_system) {
    case "SAGE_X3":
      return new SageX3Adapter(conn);
    default:
      throw new Error("Unsupported ERP system");
  }
};


exports.getERPAdapter = () => {

  const erp = process.env.ERP_SYSTEM;

  if (erp === "SAGE_X3") {
    return new SageAdapter();
  }

  throw new Error("Unsupported ERP");
};