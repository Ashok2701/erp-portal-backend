const pool = require("../config/db");

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