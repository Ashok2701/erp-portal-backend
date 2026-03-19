
const pool = require("../config/db")

exports.findByUsername  = async(username) => {
 
    const result  = await pool.query(

        `SELECT user_id, tenant_id,username, password_hash, is_active
        FROM users
        WHERE username = $1
        `,
        [username]
    );

    return result.rows[0];

};

exports.assignRoles = async (userId, roleIds) => {
  for (const roleId of roleIds) {
    await pool.query(
      `
      INSERT INTO user_roles (user_role_id, user_id, role_id)
      VALUES (uuid_generate_v4(), $1, $2)
      `,
      [userId, roleId]
    );
  }
};


exports.createUser = async (user) => {
  const result = await pool.query(
    `
    INSERT INTO users (
      user_id, tenant_id, username,email, password_hash, full_name, is_active, contact_number, whatsapp_number , country_code,erp_entity_type ,erp_entity_code
    )
    VALUES (
      gen_random_uuid(), $1, $2, $3, $4,$5, true, $6,$7, '+91',$8,$9
    )
    RETURNING user_id, username, email
    `,
    [user.tenant_id, user.username,user.email , user.password_hash, user.full_name, user.contact_number, user.whatsapp_number, user.erp_entity_type , user.erp_entity_code ]
  );

  return result.rows[0];
};

exports.getAllUsers = async (tenantId) => {
  const result = await pool.query(
    `
   SELECT u.user_id, username, full_name, u.is_active, contact_number ,whatsapp_number ,country_code ,erp_entity_code ,erp_entity_type, r.role_name
    FROM users u
    left join user_roles ur on ur.user_id = u.user_id 
    left join roles r on r.role_id  = ur.role_id 
    WHERE tenant_id = $1
    ORDER BY u.created_at DESC
    `,
    [tenantId]
  );

  return result.rows;
};


exports.getUserById = async (id) => {
  const result = await pool.query(
    `
   SELECT u.user_id, username, full_name, u.is_active, contact_number ,whatsapp_number ,country_code ,erp_entity_code ,erp_entity_type, r.role_name
    FROM users u
    left join user_roles ur on ur.user_id = u.user_id 
    left join roles r on r.role_id  = ur.role_id 
    WHERE u.user_id = $1
    ORDER BY u.created_at DESC
    `,
    [id]
  );

  return result.rows;
};

exports.checkUsernameExists = async (username) => {
  const result = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`,
    [username]
  );

  return result.rowCount > 0;
};

exports.updateUser = async (userId, data) => {

  const {
    full_name,
    email,
    contact_number,
    whatsapp_number,
    erp_entity_type,
    erp_entity_code,
    is_active
  } = data;

  await pool.query(
    `
    UPDATE users
    SET
      full_name = $1,
      email = $2,
      contact_number = $3,
      whatsapp_number = $4,
      erp_entity_type = $5,
      erp_entity_code = $6,
      is_active = $7
    WHERE user_id = $8
    `,
    [
      full_name,
      email,
      contact_number,
      whatsapp_number,
      erp_entity_type,
      erp_entity_code,
      is_active,
      userId
    ]
  );
};

exports.updateUserRoles = async (userId, roleIds) => {

  // delete old roles
  await pool.query(
    `DELETE FROM user_roles WHERE user_id = $1`,
    [userId]
  );

  // insert new roles
  for (const roleId of roleIds) {
    await pool.query(
      `
      INSERT INTO user_roles (user_role_id, user_id, role_id)
      VALUES (uuid_generate_v4(), $1, $2)
      `,
      [userId, roleId]
    );
  }
};


exports.deleteUser = async (userId) => {

  await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);

  await pool.query(`DELETE FROM users WHERE user_id = $1`, [userId]);
};

