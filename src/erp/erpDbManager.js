const { Pool: PgPool } = require("pg");
const mssql = require("mssql");

const pools = {};

exports.getErpDbPool = async (conn) => {
  const key = `${conn.erp_system}_${conn.tenant_id}`;

  if (pools[key]) {
    return pools[key];
  }

  // MSSQL
  if (conn.db_type === "mssql") {
    const pool = await mssql.connect({
      user: conn.db_user,
      password: conn.db_password,
      server: conn.db_host,
      database: conn.db_name,
      port: conn.db_port,
      options: {
        encrypt: false,            // set true for Azure SQL
        trustServerCertificate: true
      }
    });

    pools[key] = pool;
    return pool;
  }

  // PostgreSQL
  if (conn.db_type === "postgres") {
    const pool = new PgPool({
      host: conn.db_host,
      port: conn.db_port,
      database: conn.db_name,
      user: conn.db_user,
      password: conn.db_password,
      ssl: false
    });

    pools[key] = pool;
    return pool;
  }

  throw new Error(`Unsupported DB type: ${conn.db_type}`);
};