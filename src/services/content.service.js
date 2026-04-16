const db = require("../config/db");
 const emailService = require("./email.service");

exports.createContent = async (user, body) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // 1. Insert content
    const contentRes = await client.query(
      `INSERT INTO content
       (title, message, type, file_url,file_name,file_type, priority, expiry_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7, $8, $9)
       RETURNING *`,
      [
        body.title,
        body.message,
        body.type,
        body.file_url,
         body.file_name,
    body.file_type,
        body.priority,
        body.expiry_date,
        user.id
      ]
    );

    const contentId = contentRes.rows[0].id;

    // 2. Insert targets
    for (const t of body.targets) {
      await client.query(
        `INSERT INTO content_targets
         (content_id, target_type, target_value)
         VALUES ($1,$2,$3)`,
        [contentId, t.target_type, t.target_value]
      );
    }

    await client.query("COMMIT");


  // 3. Send email notification


    // Inside createContent(), after COMMIT:
    // Get target user emails for notification
    const targetEmails = [];
    for (const t of body.targets) {
      if (t.target_type === 'ALL') {
        const allUsers = await db.query('SELECT email FROM users WHERE email IS NOT NULL');
        targetEmails.push(...allUsers.rows.map(u => u.email).filter(Boolean));
      } else if (t.target_type === 'ROLE') {
        const roleUsers = await db.query(
          `SELECT u.email FROM users u
           JOIN user_roles ur ON u.user_id = ur.user_id
           JOIN roles r ON ur.role_id = r.role_id
           WHERE LOWER(r.role_name) = LOWER($1) AND u.email IS NOT NULL`,
          [t.target_value]
        );
        targetEmails.push(...roleUsers.rows.map(u => u.email).filter(Boolean));
      } else if (t.target_type === 'USER') {
        const userResult = await db.query('SELECT email FROM users WHERE user_id = $1', [t.target_value]);
        if (userResult.rows[0]?.email) targetEmails.push(userResult.rows[0].email);
      }
    }
    emailService.sendContentNotification([...new Set(targetEmails)], {
      type: body.type,
      title: body.title,
      message: body.message,
      expiry_date: body.expiry_date,
    }).catch(() => {});
   // END OF EMAIL NOTIFICATION

    return { id: contentId };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};


exports.getAllContent = async (user) => {

  const result = await db.query(
    `
    SELECT c.*, uc.status, uc.viewed_at, uc.signed_at
    FROM content c
    LEFT JOIN content_targets ct ON c.id = ct.content_id
    LEFT JOIN user_content uc 
      ON uc.content_id = c.id 
    WHERE 
      ct.target_type = 'ALL'
      OR (ct.target_type = 'USER')
      OR (ct.target_type = 'ROLE')
    ORDER BY c.created_at DESC
    `
  );

  return result.rows;
};



exports.getFeed = async (user) => {

  const result = await db.query(
    `
    SELECT c.*, uc.status, uc.viewed_at, uc.signed_at
    FROM content c
    LEFT JOIN content_targets ct ON c.id = ct.content_id
    LEFT JOIN user_content uc 
      ON uc.content_id = c.id AND uc.user_id = $1
    WHERE 
      ct.target_type = 'ALL'
      OR (ct.target_type = 'USER' AND ct.target_value = $1::text)
      OR (ct.target_type = 'ROLE' AND ct.target_value = $2)
    ORDER BY c.created_at DESC
    `,
    [user.id, user.role]
  );

  return result.rows;
};

exports.markViewed = async (userId, contentId) => {

  await db.query(
    `
    INSERT INTO user_content (user_id, content_id, status, viewed_at)
    VALUES ($1,$2,'VIEWED',NOW())
    ON CONFLICT (user_id, content_id)
    DO UPDATE SET status='VIEWED', viewed_at=NOW()
    `,
    [userId, contentId]
  );
};

exports.markSigned = async (userId, contentId) => {

  await db.query(
    `
    INSERT INTO user_content (user_id, content_id, status, signed_at)
    VALUES ($1,$2,'SIGNED',NOW())
    ON CONFLICT (user_id, content_id)
    DO UPDATE SET status='SIGNED', signed_at=NOW()
    `,
    [userId, contentId]
  );
};

exports.sendMessage = async (user, body) => {

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const contentRes = await client.query(
      `INSERT INTO content
       (title, message, type, created_by)
       VALUES ($1,$2,'MESSAGE',$3)
       RETURNING *`,
      [body.title || "Message", body.message, user.id]
    );

    const contentId = contentRes.rows[0].id;

    await client.query(
      `INSERT INTO content_targets
       (content_id, target_type, target_value)
       VALUES ($1,'ROLE','Administrator')`,
      [contentId]
    );

    await client.query("COMMIT");


    // EMAIL NOTIFICATION
    const senderResult = await db.query('SELECT username FROM users WHERE user_id = $1', [user.user_id]);
    emailService.sendMessageToAdminEmail(
      senderResult.rows[0]?.username || 'User',
      body
    ).catch(() => {});

    return { id: contentId };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

exports.getContentById = async (user, contentId) => {

  const result = await db.query(
    `
    SELECT DISTINCT
      c.*,
      COALESCE(uc.status, 'NEW') AS status,
      uc.viewed_at,
      uc.signed_at

    FROM content c

    JOIN content_targets ct
      ON c.id = ct.content_id

    LEFT JOIN user_content uc
      ON uc.content_id = c.id
      AND uc.user_id = $1

    WHERE
      c.id = $2

      AND (
        ct.target_type = 'ALL'
        OR (ct.target_type = 'USER' AND ct.target_value = $1::text)
        OR (ct.target_type = 'ROLE' AND LOWER(ct.target_value) = LOWER($3))
      )
    `,
    [user.id, contentId, user.role]
  );

  if (result.rows.length === 0) {
    throw new Error("Content not found or not authorized");
  }

  return result.rows[0];
};


exports.updateContent = async (user, contentId, body) => {

  // 🔐 Optional: only creator/admin can update
  const existing = await db.query(
    `SELECT * FROM content WHERE id = $1`,
    [contentId]
  );

  if (existing.rows.length === 0) {
    throw new Error("Content not found");
  }

  // 🔥 Update content
  const result = await db.query(
    `
    UPDATE content
    SET
      title = COALESCE($1, title),
      message = COALESCE($2, message),
      type = COALESCE($3, type),
      priority = COALESCE($4, priority),
      expiry_date = COALESCE($5, expiry_date)
    WHERE id = $6
    RETURNING *
    `,
    [
      body.title,
      body.message,
      body.type,
      body.priority,
      body.expiry_date,
      contentId
    ]
  );

  return result.rows[0];
};


exports.getAcknowledgements = async (contentId) => {
  const result = await db.query(
    `SELECT
       uc.user_id,
       u.username,
       uc.status,
       uc.viewed_at,
       uc.signed_at
     FROM user_content uc
     JOIN users u ON u.user_id = uc.user_id::uuid
     WHERE uc.content_id = $1
     ORDER BY uc.viewed_at DESC`,
    [contentId]
  );
  return result.rows;
};

exports.getSentContent = async (user) => {
  const result = await db.query(
    `SELECT * FROM content
     WHERE created_by = $1
     ORDER BY created_at DESC`,
    [user.user_id]
  );
  return result.rows;
};