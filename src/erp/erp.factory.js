const SageX3Adapter = require("./sagex3/sagex3.adapter");
const ErpConnectionModel = require("../models/erpConnection.model");

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