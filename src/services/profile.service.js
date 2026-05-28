const db = require("../config/db");
 const emailService = require("./email.service");

exports.getContentById = async (user, username) => {

  const result = await db.query(
    `
    select u.username, u.email ,
    u.full_name , u.is_active ,
    u.contact_number , u.whatsapp_number ,
    u.erp_entity_code ,u.erp_entity_type ,
    u.allowedsite
    from  users u
    WHERE
      u.username = $1
    `,
    [username]
  );

  if (result.rows.length === 0) {
    throw new Error("Profile not found or not authorized");
  }

  return result.rows[0];
};

// ======================================
// UPDATE PROFILE
// ======================================

exports.updateProfile = async (
  user,
  username,
  payload
) => {

  const {
    full_name,
    email,
    contact_number,
    whatsapp_number
  } = payload;

  const result = await db.query(
    `
    UPDATE users
    SET
      full_name = $1,
      email = $2,
      contact_number = $3,
      whatsapp_number = $4,
      updated_at = NOW()
    WHERE username = $5
    RETURNING
      username,
      full_name,
      email,
      contact_number,
      whatsapp_number
    `,
    [
      full_name,
      email,
      contact_number,
      whatsapp_number,
      username
    ]
  );

  if (result.rows.length === 0) {
    throw new Error("Profile not found");
  }

  return result.rows[0];
};
