const db = require("../config/db");
const emailService = require("./email.service");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function getS3Client() {
  return new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT || process.env.SPACES_ENDPOINT,
    region: "us-east-1",
    credentials: {
      accessKeyId:     process.env.DO_SPACES_KEY    || process.env.SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET || process.env.SPACES_SECRET,
    },
    forcePathStyle: false,
  });
}

// ── Helper: generate pre-signed URL for DOCUMENT rows ───────────
async function enrichWithPresignedUrl(rows) {
  const bucket = process.env.DO_SPACES_BUCKET || process.env.SPACES_BUCKET || "portaluploaddocs";
  const s3 = getS3Client();

  return Promise.all(rows.map(async (row) => {
    if (row.type === "DOCUMENT" && row.file_url) {
      try {
        let key = row.file_url;
        if (key.startsWith("http")) {
          const u = new URL(key);
          key = u.pathname.replace(/^\//, "");
        }
        const cmd = new GetObjectCommand({
          Bucket: bucket,
          Key:    key,
          ResponseContentDisposition: `inline; filename="${row.file_name}"`,
        });
        const presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });
        // Keep original file_url (storage key) for display, add presigned_url for actual access
        return { ...row, presigned_url: presignedUrl };
      } catch (err) {
        console.error("Presign error for content:", row.id, err.message);
        return row;
      }
    }
    return row;
  }));
}

// ── Helper: normalise userId ─────────────────────────────────────
const uid = (user) => user.user_id || user.id;

// ================================================================
// CREATE CONTENT
// ================================================================
exports.createContent = async (user, body) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const tenantId = user.tenant_id;
    const contentRes = await client.query(
      `INSERT INTO content
       (title, message, type, file_url, file_name, file_type, priority, expiry_date, created_by, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
        uid(user),
        tenantId,
      ]
    );

    const contentId = contentRes.rows[0].id;

    for (const t of body.targets) {
      await client.query(
        `INSERT INTO content_targets (content_id, target_type, target_value) VALUES ($1,$2,$3)`,
        [contentId, t.target_type, t.target_value]
      );
    }

    await client.query("COMMIT");

    // Email notifications (fire-and-forget)
    const targetEmails = [];
    for (const t of body.targets) {
      if (t.target_type === "ALL") {
        const allUsers = await db.query("SELECT email FROM users WHERE email IS NOT NULL AND is_active = true");
        targetEmails.push(...allUsers.rows.map(u => u.email).filter(Boolean));
      } else if (t.target_type === "ROLE") {
        const roleUsers = await db.query(
          `SELECT u.email FROM users u
           JOIN user_roles ur ON u.user_id = ur.user_id
           JOIN roles r ON ur.role_id = r.role_id
           WHERE LOWER(r.role_name) = LOWER($1) AND u.email IS NOT NULL`,
          [t.target_value]
        );
        targetEmails.push(...roleUsers.rows.map(u => u.email).filter(Boolean));
      } else if (t.target_type === "USER") {
        const userResult = await db.query("SELECT email FROM users WHERE user_id = $1", [t.target_value]);
        if (userResult.rows[0]?.email) targetEmails.push(userResult.rows[0].email);
      }
    }
    emailService.sendContentNotification([...new Set(targetEmails)], {
      type: body.type, title: body.title, message: body.message, expiry_date: body.expiry_date,
    }).catch(() => {});

    return { id: contentId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ================================================================
// GET ALL CONTENT (admin view)
// ================================================================
exports.getAllContent = async (user) => {
  const result = await db.query(
    `SELECT DISTINCT c.*, uc.status, uc.viewed_at, uc.signed_at
     FROM content c
     LEFT JOIN content_targets ct ON c.id = ct.content_id
     LEFT JOIN user_content uc ON uc.content_id = c.id AND uc.user_id = $1
     WHERE ct.target_type = 'ALL'
       OR (ct.target_type = 'USER')
       OR (ct.target_type = 'ROLE')
     ORDER BY c.created_at DESC`,
    [uid(user)]
  );
  return result.rows;
};

// ================================================================
// GET FEED  ★ FIX: user.id is correct (auth middleware sets both id + user_id)
//              BUT also need to handle username in signDocument
// ================================================================
exports.getFeed = async (user) => {
  const userId   = uid(user);
  const roleName = user.role || "";

  let result;

  if (user.status === "IN_VERIFICATION" || user.status === "PENDING_APPROVAL") {
    result = await db.query(
      `SELECT c.*, uc.status, uc.viewed_at, uc.signed_at
       FROM content c
       JOIN content_targets ct ON c.id = ct.content_id
       LEFT JOIN user_content uc ON uc.content_id = c.id AND uc.user_id = $1
       WHERE ct.target_type = 'USER' AND ct.target_value = $1::text
       AND c.tenant_id = $2
       ORDER BY c.created_at DESC`,
      [userId, user.tenant_id]
    );
  } else {
    result = await db.query(
      `SELECT c.*, uc.status, uc.viewed_at, uc.signed_at
       FROM content c
       LEFT JOIN content_targets ct ON c.id = ct.content_id
       LEFT JOIN user_content uc ON uc.content_id = c.id AND uc.user_id = $1
       WHERE ct.target_type = 'ALL'
         OR (ct.target_type = 'USER' AND ct.target_value = $1::text)
         OR (ct.target_type = 'ROLE' AND ct.target_value = $2)
       ORDER BY c.created_at DESC`,
      [userId, roleName]
    );
  }

  return enrichWithPresignedUrl(result.rows);
};

// ================================================================
// MARK VIEWED  ★ FIX: controller was passing req.user.id (undefined) — now passes req.user
//                     We accept either userId directly or user object
// ================================================================
exports.markViewed = async (userOrId, contentId) => {
  const userId = typeof userOrId === "object" ? uid(userOrId) : userOrId;
  await db.query(
    `INSERT INTO user_content (user_id, content_id, status, viewed_at)
     VALUES ($1,$2,'VIEWED',NOW())
     ON CONFLICT (user_id, content_id)
     DO UPDATE SET status='VIEWED', viewed_at=NOW()`,
    [userId, contentId]
  );
};

// ================================================================
// MARK SIGNED  ★ FIX: same as markViewed
// ================================================================
exports.markSigned = async (userOrId, contentId) => {
  const userId = typeof userOrId === "object" ? uid(userOrId) : userOrId;
  await db.query(
    `INSERT INTO user_content (user_id, content_id, status, signed_at)
     VALUES ($1,$2,'SIGNED',NOW())
     ON CONFLICT (user_id, content_id)
     DO UPDATE SET status='SIGNED', signed_at=NOW()`,
    [userId, contentId]
  );
};

// ================================================================
// SEND MESSAGE
// ================================================================
exports.sendMessage = async (user, body) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const contentRes = await client.query(
      `INSERT INTO content (title, message, type, created_by)
       VALUES ($1,$2,'MESSAGE',$3) RETURNING *`,
      [body.title || "Message", body.message, uid(user)]
    );

    await client.query(
      `INSERT INTO content_targets (content_id, target_type, target_value)
       VALUES ($1,'ROLE','Administrator')`,
      [contentRes.rows[0].id]
    );

    await client.query("COMMIT");

    const senderResult = await db.query(
      "SELECT username FROM users WHERE user_id = $1", [uid(user)]
    );
    emailService.sendMessageToAdminEmail(
      senderResult.rows[0]?.username || "User", body
    ).catch(() => {});

    return { id: contentRes.rows[0].id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ================================================================
// GET CONTENT BY ID  ★ FIX: return enriched row (was returning unenriched result.rows[0])
// ================================================================
exports.getContentById = async (user, contentId) => {
  const userId   = uid(user);
  const roleName = user.role || "";

  const result = await db.query(
    `SELECT DISTINCT
       c.*,
       COALESCE(uc.status, 'NEW') AS status,
       uc.viewed_at,
       uc.signed_at
     FROM content c
     JOIN content_targets ct ON c.id = ct.content_id
     LEFT JOIN user_content uc ON uc.content_id = c.id AND uc.user_id = $1
     WHERE c.id = $2
       AND (
         ct.target_type = 'ALL'
         OR (ct.target_type = 'USER' AND ct.target_value = $1::text)
         OR (ct.target_type = 'ROLE' AND LOWER(ct.target_value) = LOWER($3))
       )`,
    [userId, contentId, roleName]
  );

  if (result.rows.length === 0) throw new Error("Content not found or not authorized");

  // ★ FIX: actually return the enriched row (was discarding enriched variable)
  const enriched = await enrichWithPresignedUrl(result.rows);
  return enriched[0];
};

// ================================================================
// UPDATE CONTENT
// ================================================================
exports.updateContent = async (user, contentId, body) => {
  const existing = await db.query("SELECT * FROM content WHERE id = $1", [contentId]);
  if (existing.rows.length === 0) throw new Error("Content not found");

  const result = await db.query(
    `UPDATE content SET
       title       = COALESCE($1, title),
       message     = COALESCE($2, message),
       type        = COALESCE($3, type),
       priority    = COALESCE($4, priority),
       expiry_date = COALESCE($5, expiry_date)
     WHERE id = $6 RETURNING *`,
    [body.title, body.message, body.type, body.priority, body.expiry_date, contentId]
  );
  return result.rows[0];
};

// ================================================================
// GET ACKNOWLEDGEMENTS
// ================================================================
exports.getAcknowledgements = async (contentId) => {
  const result = await db.query(
    `SELECT uc.user_id, u.username, uc.status, uc.viewed_at, uc.signed_at
     FROM user_content uc
     JOIN users u ON u.user_id = uc.user_id::uuid
     WHERE uc.content_id = $1
     ORDER BY uc.viewed_at DESC`,
    [contentId]
  );
  return result.rows;
};

// ================================================================
// GET SENT CONTENT
// ================================================================
exports.getSentContent = async (user) => {
  const result = await db.query(
    `SELECT * FROM content WHERE created_by = $1 ORDER BY created_at DESC`,
    [uid(user)]
  );
  return result.rows;
};
