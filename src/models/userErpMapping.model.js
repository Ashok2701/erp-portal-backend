const pool = require("../config/db");

exports.upsertMapping = async ({
  user_id,
  erp_system,
  erp_entity_type,
  erp_entity_code
}) => {
  const result = await pool.query(
    `
    INSERT INTO user_erp_mapping (
      mapping_id,
      user_id,
      erp_system,
      erp_entity_type,
      erp_entity_code,
      is_active
    )
    VALUES (
      gen_random_uuid(),
      $1, $2, $3, $4, true
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      erp_system = EXCLUDED.erp_system,
      erp_entity_type = EXCLUDED.erp_entity_type,
      erp_entity_code = EXCLUDED.erp_entity_code,
      is_active = true
    RETURNING *
    `,
    [user_id, erp_system, erp_entity_type, erp_entity_code]
  );

  return result.rows[0];
};

exports.getMappingByUserId = async (userId) => {
  const result = await pool.query(
    `
    SELECT erp_system, erp_entity_type, erp_entity_code
    FROM user_erp_mapping
    WHERE user_id = $1
      AND is_active = true
    `,
    [userId]
  );

  return result.rows[0];
};
