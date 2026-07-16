"use strict";
const db = require("../config/db");

// In-memory cache — settings loaded once per tenant per process.
//
// IMPORTANT: this cache is per-process. On a horizontally-scaled deployment
// (multiple App Platform instances behind the LB), a settings update handled
// by instance A calls clearCache() only on instance A — any other instance
// that already cached this tenant keeps serving the stale row (e.g. missing
// a password an admin just saved) until it happens to restart. A short TTL
// bounds that staleness window so the fix shows up within CACHE_TTL_MS on
// every instance even without a redeploy, instead of relying entirely on the
// explicit clearCache() call reaching every instance.
const CACHE_TTL_MS = 60 * 1000; // 60s
const cache = {}; // tenantId -> { data, expiresAt }

exports.getTenantSettings = async (tenantId) => {
  const cached = cache[tenantId];
  if (cached && cached.expiresAt > Date.now()) return cached.data;

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
    cache[tenantId] = { data: s, expiresAt: Date.now() + CACHE_TTL_MS };
    return s;
  }

  cache[tenantId] = { data: result.rows[0], expiresAt: Date.now() + CACHE_TTL_MS };
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
     -- COALESCE against the existing row on every field: the tenant-detail UI
     -- saves each tab (ERP / X3 / SMTP / Branding / Storage) independently, so
     -- a save from one tab sends a body that simply doesn't include the other
     -- tabs' fields. Those arrive here as JS 'undefined' -> SQL NULL. Without
     -- COALESCE, that blind overwrite silently wiped out already-configured
     -- values (e.g. saving the SMTP tab would null out erp_db_password that
     -- had just been set on the ERP tab) — the real reason a fix that clearly
     -- persisted still looked broken again shortly after.
     ON CONFLICT (tenant_id) DO UPDATE SET
       erp_system=COALESCE($2, tenant_settings.erp_system),
       erp_db_type=COALESCE($3, tenant_settings.erp_db_type),
       erp_db_host=COALESCE($4, tenant_settings.erp_db_host),
       erp_db_port=COALESCE($5, tenant_settings.erp_db_port),
       erp_db_name=COALESCE($6, tenant_settings.erp_db_name),
       erp_db_user=COALESCE($7, tenant_settings.erp_db_user),
       erp_db_password=COALESCE($8, tenant_settings.erp_db_password),
       x3_soap_url=COALESCE($9, tenant_settings.x3_soap_url),
       x3_wsdl_url=COALESCE($10, tenant_settings.x3_wsdl_url),
       x3_username=COALESCE($11, tenant_settings.x3_username),
       x3_password=COALESCE($12, tenant_settings.x3_password),
       x3_pool_alias=COALESCE($13, tenant_settings.x3_pool_alias),
       x3_sales_site=COALESCE($14, tenant_settings.x3_sales_site),
       x3_order_type=COALESCE($15, tenant_settings.x3_order_type),
       smtp_host=COALESCE($16, tenant_settings.smtp_host),
       smtp_port=COALESCE($17, tenant_settings.smtp_port),
       smtp_user=COALESCE($18, tenant_settings.smtp_user),
       smtp_password=COALESCE($19, tenant_settings.smtp_password),
       smtp_from=COALESCE($20, tenant_settings.smtp_from),
       spaces_folder=COALESCE($21, tenant_settings.spaces_folder),
       portal_url=COALESCE($22, tenant_settings.portal_url),
       admin_email=COALESCE($23, tenant_settings.admin_email),
       updated_at=NOW()`,
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
