"use strict";
const { Pool: PgPool } = require("pg");
const mssql = require("mssql");

// Pool keyed by "tenantId_dbHost_dbName" — allows same server, different DBs
const pools = {};

exports.getErpDbPool = async (settings) => {
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
