
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


exports.createUser = async (user) => {
  const result = await pool.query(
    `
    INSERT INTO users (
      user_id, tenant_id, username,email, password_hash, full_name, is_active
    )
    VALUES (
      gen_random_uuid(), $1, $2, $3, $4,$5, true
    )
    RETURNING user_id, username, email
    `,
    [user.tenant_id, user.username,user.email , user.password_hash, user.full_name]
  );

  return result.rows[0];
};

exports.getAllUsers = async (tenantId) => {
  const result = await pool.query(
    `
    SELECT user_id, username, full_name, is_active
    FROM users
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    `,
    [tenantId]
  );

  return result.rows;
};