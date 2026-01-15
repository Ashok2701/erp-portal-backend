const { urlencoded } = require("express");
const pool  = require("../config/db");

exports.getRolesByUserId = async (userId) => {

    const result = await pool.query(
   `
    SELECT 
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.role_id
    WHERE ur.user_id = $1
    `,
    [userId]
)

   return result.rows;
}