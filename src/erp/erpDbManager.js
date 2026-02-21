
const { Pool } = require("pg");

const pools = {};

exports.getErpDbPool = (conn) => {
  const key = `${conn.erp_system}_${conn.tenant_id}`;

  if (!pools[key]) {
    pools[key] = new Pool({
      host: conn.db_host,
      port: conn.db_port,
      database: conn.db_name,
      user: conn.db_user,
      password: conn.db_password,
      ssl: false
    });
  }

  return pools[key];
};
