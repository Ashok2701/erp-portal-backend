const pool = require("../config/db");

exports.getByTenant = async (tenantId) => {
  const result = await pool.query(
    `
    SELECT *
    FROM erp_connections
    WHERE tenant_id = $1
      AND is_active = true
    LIMIT 1
    `,
    [tenantId]
  );

  return result.rows[0];
};