"use strict";
const SageX3Adapter       = require("./sagex3/sagex3.adapter");
const TenantSettingsModel = require("../models/tenantSettings.model");

// Pool of per-tenant adapters (avoid recreating connection pools)
const adapterCache = {};

/**
 * THE single factory method — always use this.
 * Reads from tenant_settings table. Falls back to .env for local dev.
 * Supports multiple tenants sharing same SQL Server (different db_name).
 */
exports.getERPAdapterForUser = async (user) => {
  const tenantId = user.tenant_id;
  if (!tenantId) throw new Error("user.tenant_id is required");

  if (adapterCache[tenantId]) return adapterCache[tenantId];

  const settings = await TenantSettingsModel.getTenantSettings(tenantId);
  if (!settings) throw new Error(`No ERP settings found for tenant ${tenantId}`);

  let adapter;
  switch ((settings.erp_system || "SAGE_X3").toUpperCase()) {
    case "SAGE_X3":
      adapter = new SageX3Adapter(settings);
      break;
    // future: case "DYNAMICS_365": adapter = new DynamicsAdapter(settings); break;
    // future: case "INTACCT":      adapter = new IntacctAdapter(settings); break;
    default:
      throw new Error(`Unsupported ERP system: ${settings.erp_system}`);
  }

  adapterCache[tenantId] = adapter;
  return adapter;
};

// Clear adapter cache when tenant settings change
exports.clearAdapterCache = (tenantId) => {
  if (tenantId) delete adapterCache[tenantId];
  else Object.keys(adapterCache).forEach(k => delete adapterCache[k]);
};

// Legacy alias — kept so nothing breaks during transition
exports.getERPAdapter = () => {
  const erp = process.env.ERP_SYSTEM || "SAGE_X3";
  if (erp === "SAGE_X3") {
    // Build a settings-like object from env vars
    return new SageX3Adapter({
      erp_db_type:    process.env.ERP_DB_TYPE    || "mssql",
      erp_db_host:    process.env.ERP_DB_HOST,
      erp_db_port:    parseInt(process.env.ERP_DB_PORT) || 1433,
      erp_db_name:    process.env.ERP_DB_NAME,
      erp_db_user:    process.env.ERP_DB_USER,
      erp_db_password:process.env.ERP_DB_PASSWORD,
      x3_pool_alias:  process.env.X3_POOL_ALIAS,
      x3_sales_site:  process.env.X3_SALES_SITE,
      x3_order_type:  process.env.X3_ORDER_TYPE,
      x3_soap_url:    process.env.X3_SOAP_URL,
      x3_wsdl_url:    process.env.X3_WSDL_URL,
      x3_username:    process.env.X3_USERNAME,
      x3_password:    process.env.X3_PASSWORD,
    });
  }
  throw new Error("Unsupported ERP");
};
