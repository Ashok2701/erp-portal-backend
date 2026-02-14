const pool = require("../config/db");
const { v4: uuidv4 } = require("uuid");
exports.getModulesByUserId = async (userId) => {

  const result = await pool.query(

    `
    SELECT DISTINCT
       m.module_code, m.module_name, m.route_path, m.icon_name,
       rm.can_view, rm.can_create, rm.can_edit, rm.can_delete
    FROM user_roles ur
    JOIN role_modules rm ON ur.role_id = rm.role_id
    JOIN modules m ON rm.module_id = m.module_id
    WHERE ur.user_id = $1
    AND m.is_active = true
    AND rm.can_view = true
    ORDER BY m.module_name
    `,
    [userId]
  );


  return result.rows;
};


exports.createModule = async (data) => {
  const {
    module_code,
    module_name,
    module_type,
    route_path,
    icon_name
  } = data;

  const result = await pool.query(
    `
    INSERT INTO modules (
      module_id,
      module_code,
      module_name,
      module_type,
      route_path,
      icon_name,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, true)
    RETURNING *
    `,
    [
      uuidv4(),
      module_code,
      module_name,
      module_type,
      route_path,
      icon_name
    ]
  );

  return result.rows[0];
};

exports.deleteModule = async (module_id) => {
  await pool.query(
    `DELETE FROM modules WHERE module_id = $1`,
    [module_id]
  );
};


exports.updateModule = async (module_id, data) => {
  const {
    module_name,
    module_type,
    route_path,
    icon_name,
    is_active
  } = data;

  const result = await pool.query(
    `
    UPDATE modules
    SET module_name = $1,
        module_type = $2,
        route_path = $3,
        icon_name = $4,
        is_active = $5
    WHERE module_id = $6
    RETURNING *
    `,
    [
      module_name,
      module_type,
      route_path,
      icon_name,
      is_active,
      module_id
    ]
  );

  return result.rows[0];
};

exports.softDeleteModule = async (module_id) => {
  await pool.query(
    `
    UPDATE modules
    SET is_active = false
    WHERE module_id = $1
    `,
    [module_id]
  );
};

exports.getActiveModules = async () => {
  const result = await pool.query(`
    SELECT *
    FROM modules
    WHERE is_active = true
    ORDER BY module_name
  `);

  return result.rows;
};

exports.getAllModules = async () => {
  const result = await pool.query(`
    SELECT *
    FROM modules
    ORDER BY module_name
  `);

  return result.rows;
};



