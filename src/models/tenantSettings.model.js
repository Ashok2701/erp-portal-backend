"use strict";
const db = require("../config/db");

// In-memory cache — settings loaded once per tenant per process
const cache = {};

exports.getTenantSettings = async (tenantId) => {
  if (cache[tenantId]) return cache[tenantId];

  const result = await db.query(
    `SELECT ts.*, t.slug AS tenant_slug, t.tenant_name, t.plan
     FROM tenant_settings ts
     JOIN tenants t ON ts.tenant_id = t.tenant_id
     WHERE ts.tenant_id = $1`,
    [tenantId]
  );

  if (result.rows.length === 0) {
    // Fall back to env vars (local dev / single-tenant legacy)
    const s = {
      tenant_id:      tenantId,
      tenant_slug:    process.env.TENANT_SLUG || "temaglobal",
      erp_system:     process.env.ERP_SYSTEM  || "SAGE_X3",
      erp_db_type:    process.env.ERP_DB_TYPE || "mssql",
      erp_db_host:    process.env.ERP_DB_HOST,
      erp_db_port:    parseInt(process.env.ERP_DB_PORT) || 1433,
      erp_db_name:    process.env.ERP_DB_NAME,
      erp_db_user:    process.env.ERP_DB_USER,
      erp_db_password:process.env.ERP_DB_PASSWORD,
      x3_soap_url:    process.env.X3_SOAP_URL,
      x3_wsdl_url:    process.env.X3_WSDL_URL,
      x3_username:    process.env.X3_USERNAME,
      x3_password:    process.env.X3_PASSWORD,
      x3_pool_alias:  process.env.X3_POOL_ALIAS,
      x3_sales_site:  process.env.X3_SALES_SITE,
      x3_order_type:  process.env.X3_ORDER_TYPE,
      smtp_host:      process.env.SMTP_HOST,
      smtp_port:      parseInt(process.env.SMTP_PORT) || 465,
      smtp_user:      process.env.SMTP_USER,
      smtp_password:  process.env.SMTP_PASS,
      smtp_from:      process.env.SMTP_FROM,
      spaces_folder:  process.env.TENANT_SLUG || "temaglobal",
      portal_url:     process.env.PORTAL_URL,
      admin_email:    process.env.ADMIN_EMAIL,
    };
    cache[tenantId] = s;
    return s;
  }

  cache[tenantId] = result.rows[0];
  return result.rows[0];
};

// Call this after updating tenant settings — clears cache so next request reloads
exports.clearCache = (tenantId) => {
  if (tenantId) delete cache[tenantId];
  else Object.keys(cache).forEach(k => delete cache[k]);
};

exports.upsertTenantSettings = async (tenantId, settings) => {
  const {
    erp_system, erp_db_type, erp_db_host, erp_db_port,
    erp_db_name, erp_db_user, erp_db_password,
    x3_soap_url, x3_wsdl_url, x3_username, x3_password,
    x3_pool_alias, x3_sales_site, x3_order_type,
    smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
    spaces_folder, portal_url, admin_email,
  } = settings;

  await db.query(
    `INSERT INTO tenant_settings
       (tenant_id, erp_system, erp_db_type, erp_db_host, erp_db_port,
        erp_db_name, erp_db_user, erp_db_password,
        x3_soap_url, x3_wsdl_url, x3_username, x3_password,
        x3_pool_alias, x3_sales_site, x3_order_type,
        smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
        spaces_folder, portal_url, admin_email, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       erp_system=$2, erp_db_type=$3, erp_db_host=$4, erp_db_port=$5,
       erp_db_name=$6, erp_db_user=$7, erp_db_password=$8,
       x3_soap_url=$9, x3_wsdl_url=$10, x3_username=$11, x3_password=$12,
       x3_pool_alias=$13, x3_sales_site=$14, x3_order_type=$15,
       smtp_host=$16, smtp_port=$17, smtp_user=$18, smtp_password=$19, smtp_from=$20,
       spaces_folder=$21, portal_url=$22, admin_email=$23, updated_at=NOW()`,
    [tenantId, erp_system, erp_db_type, erp_db_host, erp_db_port,
     erp_db_name, erp_db_user, erp_db_password,
     x3_soap_url, x3_wsdl_url, x3_username, x3_password,
     x3_pool_alias, x3_sales_site, x3_order_type,
     smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
     spaces_folder, portal_url, admin_email]
  );

  exports.clearCache(tenantId);
  const r = await db.query("SELECT * FROM tenant_settings WHERE tenant_id=$1",[tenantId]);
  return r.rows[0];
};
