"use strict";
const { Pool: PgPool } = require("pg");
const mssql = require("mssql");

// Pool keyed by "tenantId_dbHost_dbName" — allows same server, different DBs
const pools = {};

exports.getErpDbPool = async (settings) => {
  // ── Config validation — return clear errors before attempting connection ──
  const missing = [];
  if (!settings.erp_db_host     || !String(settings.erp_db_host).trim())     missing.push("Database host (erp_db_host)");
  if (!settings.erp_db_name     || !String(settings.erp_db_name).trim())     missing.push("Database name (erp_db_name)");
  if (!settings.erp_db_user     || !String(settings.erp_db_user).trim())     missing.push("Database user (erp_db_user)");
  if (!settings.erp_db_password || !String(settings.erp_db_password).trim()) missing.push("Database password (erp_db_password)");

  if (missing.length > 0) {
    const err = new Error(
      "ERP database not configured. Missing: " + missing.join(", ") +
      ". Please contact your administrator to complete the ERP setup."
    );
    err.code = "ERP_NOT_CONFIGURED";
    throw err;
  }

  const key = `${settings.tenant_id || "default"}_${settings.erp_db_host}_${settings.erp_db_name}`;

  if (pools[key]) return pools[key];

  const dbType = (settings.erp_db_type || "mssql").toLowerCase();

  if (dbType === "mssql") {
    const pool = await mssql.connect({
      user:     settings.erp_db_user,
      password: settings.erp_db_password,
      server:   settings.erp_db_host,
      database: settings.erp_db_name,
      port:     parseInt(settings.erp_db_port) || 1433,
      options:  { encrypt: false, trustServerCertificate: true },
    });
    pools[key] = pool;
    return pool;
  }

  if (dbType === "postgres") {
    const pool = new PgPool({
      host:     settings.erp_db_host,
      port:     parseInt(settings.erp_db_port) || 5432,
      database: settings.erp_db_name,
      user:     settings.erp_db_user,
      password: settings.erp_db_password,
      ssl: false,
    });
    pools[key] = pool;
    return pool;
  }

  throw new Error(`Unsupported ERP DB type: ${dbType}`);
};

exports.clearPool = (tenantId) => {
  Object.keys(pools).filter(k => k.startsWith(tenantId)).forEach(k => delete pools[k]);
};
