const { urlencoded } = require("express");
const pool  = require("../config/db");
const { v4: uuidv4 } = require("uuid");

exports.getRolesByUserId = async (userId) => {

    const result = await pool.query(
   `
    SELECT r.role_name
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.role_id
    WHERE ur.user_id = $1
    `,
    [userId]
)

   return result.rows;
}

exports.createRole = async (data) => {
  const { role_code, role_name, description } = data;

  const result = await pool.query(
    `
    INSERT INTO roles (
      role_id,
      role_code,
      role_name,
      description,
      is_active
    )
    VALUES ($1, $2, $3, $4, true)
    RETURNING *
    `,
    [uuidv4(), role_code.toUpperCase(), role_name, description]
  );

  return result.rows[0];
};

exports.getAllRoles = async () => {
  const result = await pool.query(`
    SELECT *
    FROM roles
    ORDER BY description
  `);

  return result.rows;
};

exports.getActiveRoles = async () => {
  const result = await pool.query(`
    SELECT role_id, role_code, role_name
    FROM roles
    WHERE is_active = true
    ORDER BY role_name
  `);

  return result.rows;
};

exports.updateRole = async (role_id, data) => {
  const { role_name, is_active, description } = data;

  const result = await pool.query(
    `
    UPDATE roles
    SET role_name = $1,
        is_active = $2,
        description = $3
    WHERE role_id = $4
    RETURNING *
    `,
    [role_name, is_active, description, role_id]
  );

  return result.rows[0];
};


exports.softDeleteRole = async (role_id) => {
  await pool.query(
    `
    UPDATE roles
    SET is_active = false
    WHERE role_id = $1
    `,
    [role_id]
  );
};
