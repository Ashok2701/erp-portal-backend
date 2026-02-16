const pool = require("../config/db");

/*
  Get all role-module mappings (Admin view)
*/
exports.getAllMappings = async () => {
  const result = await pool.query(`
    SELECT
      rm.role_id,
      r.role_name,
      rm.module_id,
      m.module_name,
      m.route_path,
      m.icon_name,
      rm.can_view,
      rm.can_create,
      rm.can_edit,
      rm.can_delete
    FROM role_modules rm
    JOIN roles r ON rm.role_id = r.role_id
    JOIN modules m ON rm.module_id = m.module_id
    ORDER BY r.role_name, m.module_name
  `);

  return result.rows;
};

/*
  Get modules for specific role
*/
exports.getByRoleId = async (roleId) => {
  const result = await pool.query(`
    SELECT
      rm.module_id,
      m.module_name,
      m.route_path,
      m.icon_name,
      rm.can_view,
      rm.can_create,
      rm.can_edit,
      rm.can_delete
    FROM role_modules rm
    JOIN modules m ON rm.module_id = m.module_id
    WHERE rm.role_id = $1
    ORDER BY m.module_name
  `, [roleId]);

  return result.rows;
};

/*
  Assign module to role
*/
exports.assignModule = async (data) => {
  const {
    role_id,
    module_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  } = data;

  await pool.query(`
    INSERT INTO role_modules
      (role_id, module_id, can_view, can_create, can_edit, can_delete)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    role_id,
    module_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  ]);
};

/*
  Update permissions
*/
exports.updatePermissions = async (data) => {
  const {
    role_id,
    module_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  } = data;

  await pool.query(`
    UPDATE role_modules
    SET
      can_view = $3,
      can_create = $4,
      can_edit = $5,
      can_delete = $6
    WHERE role_id = $1 AND module_id = $2
  `, [
    role_id,
    module_id,
    can_view,
    can_create,
    can_edit,
    can_delete
  ]);
};

/*
  Remove module from role
*/
exports.removeMapping = async (role_id, module_id) => {
  await pool.query(`
    DELETE FROM role_modules
    WHERE role_id = $1 AND module_id = $2
  `, [role_id, module_id]);
};
