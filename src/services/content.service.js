const db = require("../config/db");

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
       VALUES ($1,'ROLE','ADMIN')`,
      [contentId]
    );

    await client.query("COMMIT");

    return { id: contentId };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};