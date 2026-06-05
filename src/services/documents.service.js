// src/services/documents.service.js
// Admin Document Library — full CRUD + Spaces + signed-doc listing

const db = require("../config/db");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ----------------------------------------------------------------
// S3 client (DigitalOcean Spaces)
// ----------------------------------------------------------------
function getS3() {
  return new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT || process.env.SPACES_ENDPOINT,
    region: "us-east-1",
    credentials: {
      accessKeyId:     process.env.DO_SPACES_KEY || process.env.SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET || process.env.SPACES_SECRET,
    },
    forcePathStyle: false,
  });
}

const BUCKET = () => process.env.DO_SPACES_BUCKET || process.env.SPACES_BUCKET || "portaluploaddocs";

function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// ----------------------------------------------------------------
// Enrich a legal_documents row with signed_count
// ----------------------------------------------------------------
async function enrichDoc(row) {
  const cnt = await db.query(
    "SELECT COUNT(*) FROM user_signed_documents WHERE legal_document_id = $1",
    [row.id]
  );
  return { ...row, signed_count: Number(cnt.rows[0].count) };
}

// ================================================================
// LIST TEMPLATES
// ================================================================
exports.listDocuments = async (includeArchived = false) => {
  const result = await db.query(
    `SELECT ld.*,
            (SELECT COUNT(*) FROM user_signed_documents usd
             WHERE usd.legal_document_id = ld.id) AS signed_count
     FROM legal_documents ld
     WHERE ($1 = true OR ld.is_archived = false)
     ORDER BY ld.created_at DESC`,
    [includeArchived]
  );
  return result.rows;
};

// ================================================================
// UPLOAD NEW TEMPLATE
// ================================================================
exports.uploadDocument = async (admin, file, body) => {
  const { title, description = "", required_for_signup = "false" } = body;

  if (!file)  throw new Error("file is required");
  if (!title) throw new Error("title is required");
  if (file.mimetype !== "application/pdf")
    throw new Error("Only PDF files are accepted");

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key      = `template/${safeName}`;

  await getS3().send(new PutObjectCommand({
    Bucket:      BUCKET(),
    Key:         key,
    Body:        file.buffer,
    ContentType: "application/pdf",
    ACL:         "private",
  }));

  const result = await db.query(
    `INSERT INTO legal_documents
       (title, description, spaces_key, file_name, file_size_bytes, content_type,
        version, required_for_signup, is_archived, created_by_user_id, is_active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'application/pdf',1,$6,false,$7,true,NOW(),NOW())
     RETURNING *`,
    [
      title,
      description,
      key,
      safeName,
      file.size,
      required_for_signup === "true" || required_for_signup === true,
      admin.user_id,
    ]
  );

  return enrichDoc(result.rows[0]);
};

// ================================================================
// UPDATE METADATA (title / description / required_for_signup)
// ================================================================
exports.updateDocument = async (id, body) => {
  const { title, description, required_for_signup } = body;

  const result = await db.query(
    `UPDATE legal_documents
     SET title               = COALESCE($1, title),
         description         = COALESCE($2, description),
         required_for_signup = COALESCE($3, required_for_signup),
         updated_at          = NOW()
     WHERE id = $4
     RETURNING *`,
    [title ?? null, description ?? null, required_for_signup ?? null, id]
  );

  if (result.rows.length === 0) throw new Error("Document not found");
  return enrichDoc(result.rows[0]);
};

// ================================================================
// REPLACE FILE (archive old version, upload new)
// ================================================================
exports.replaceDocument = async (id, admin, file) => {
  if (!file) throw new Error("file is required");
  if (file.mimetype !== "application/pdf")
    throw new Error("Only PDF files are accepted");

  const docRes = await db.query(
    "SELECT * FROM legal_documents WHERE id = $1",
    [id]
  );
  if (docRes.rows.length === 0) throw new Error("Document not found");
  const doc = docRes.rows[0];

  const s3 = getS3();

  // 1. Copy current file to archive folder
  const archiveKey = `template_archive/${
    (doc.file_name || "doc").replace(/\.pdf$/i, "")
  }__v${doc.version}__${nowSlug()}.pdf`;

  await s3.send(new CopyObjectCommand({
    Bucket:     BUCKET(),
    CopySource: `${BUCKET()}/${doc.spaces_key}`,
    Key:        archiveKey,
    ACL:        "private",
  }));

  // 2. Record version history
  await db.query(
    `INSERT INTO legal_document_versions
       (legal_document_id, version, spaces_key, file_size_bytes, uploaded_by_user_id, uploaded_at)
     VALUES ($1,$2,$3,$4,$5,NOW())`,
    [doc.id, doc.version, archiveKey, doc.file_size_bytes, admin.user_id]
  );

  // 3. Upload new file under the same template/ key
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const newKey   = `template/${safeName}`;

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET(),
    Key:         newKey,
    Body:        file.buffer,
    ContentType: "application/pdf",
    ACL:         "private",
  }));

  // 4. Bump version in DB
  const updated = await db.query(
    `UPDATE legal_documents
     SET spaces_key      = $1,
         file_name       = $2,
         file_size_bytes = $3,
         version         = version + 1,
         updated_at      = NOW()
     WHERE id = $4
     RETURNING *`,
    [newKey, safeName, file.size, id]
  );

  return enrichDoc(updated.rows[0]);
};

// ================================================================
// ARCHIVE TEMPLATE
// ================================================================
exports.archiveDocument = async (id) => {
  const result = await db.query(
    "UPDATE legal_documents SET is_archived = true, updated_at = NOW() WHERE id = $1 RETURNING id",
    [id]
  );
  if (result.rows.length === 0) throw new Error("Document not found");
  return { ok: true };
};

// ================================================================
// PRE-SIGNED URL FOR TEMPLATE
// ================================================================
exports.getPresignedUrl = async (id, disposition = "inline") => {
  const docRes = await db.query(
    "SELECT * FROM legal_documents WHERE id = $1",
    [id]
  );
  if (docRes.rows.length === 0) throw new Error("Document not found");
  const doc = docRes.rows[0];

  // Support both spaces_key and legacy file_url
  let key = doc.spaces_key || doc.file_url;
  if (key && key.startsWith("http")) {
    const u = new URL(key);
    key = u.pathname.replace(/^\//, "");
  }

  const cmd = new GetObjectCommand({
    Bucket: BUCKET(),
    Key:    key,
    ResponseContentDisposition: `${disposition}; filename="${doc.file_name}"`,
  });

  const url = await getSignedUrl(getS3(), cmd, { expiresIn: 300 });
  return { url };
};

// ================================================================
// LIST SIGNED DOCUMENTS (admin)
// ================================================================
exports.listSignedDocuments = async (filters = {}) => {
  const {
    user_id,
    document_id,
    from,
    to,
    page      = 1,
    page_size = 20,
  } = filters;

  const conditions = [];
  const params     = [];
  let   idx        = 1;

  if (user_id) {
    conditions.push(`usd.user_id = $${idx++}`);
    params.push(user_id);
  }
  if (document_id) {
    conditions.push(`usd.legal_document_id = $${idx++}`);
    params.push(document_id);
  }
  if (from) {
    conditions.push(`usd.signed_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`usd.signed_at <= $${idx++}`);
    params.push(to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * page_size;

  const countRes = await db.query(
    `SELECT COUNT(*) FROM user_signed_documents usd ${where}`,
    params
  );

  const rows = await db.query(
    `SELECT
       usd.id,
       usd.user_id,
       u.username,
       COALESCE(usd.full_name, u.full_name)        AS full_name,
       usd.legal_document_id,
       COALESCE(usd.document_title, ld.title)      AS document_title,
       usd.signed_file_name,
       usd.signed_spaces_key,
       usd.signed_at,
       usd.ip_address,
       usd.user_agent
     FROM user_signed_documents usd
     JOIN users u           ON u.user_id = usd.user_id::uuid
     JOIN legal_documents ld ON ld.id     = usd.legal_document_id
     ${where}
     ORDER BY usd.signed_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, page_size, offset]
  );

  return {
    items: rows.rows,
    total: Number(countRes.rows[0].count),
    page:  Number(page),
    page_size: Number(page_size),
  };
};

// ================================================================
// PRE-SIGNED URL FOR SIGNED DOCUMENT (admin)
// ================================================================
exports.getSignedDocPresignedUrl = async (id, disposition = "inline") => {
  const result = await db.query(
    "SELECT * FROM user_signed_documents WHERE id = $1",
    [id]
  );
  if (result.rows.length === 0) throw new Error("Signed document not found");
  const row = result.rows[0];

  const cmd = new GetObjectCommand({
    Bucket: BUCKET(),
    Key:    row.signed_spaces_key,
    ResponseContentDisposition: `${disposition}; filename="${row.signed_file_name}"`,
  });

  const url = await getSignedUrl(getS3(), cmd, { expiresIn: 300 });
  return { url };
};

// ================================================================
// CSV EXPORT
// ================================================================
exports.buildCsvExport = async (filters = {}) => {
  const { user_id, document_id, from, to } = filters;

  const conditions = [];
  const params     = [];
  let   idx        = 1;

  if (user_id)     { conditions.push(`usd.user_id = $${idx++}`);              params.push(user_id); }
  if (document_id) { conditions.push(`usd.legal_document_id = $${idx++}`);    params.push(document_id); }
  if (from)        { conditions.push(`usd.signed_at >= $${idx++}`);           params.push(from); }
  if (to)          { conditions.push(`usd.signed_at <= $${idx++}`);           params.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db.query(
    `SELECT
       usd.id,
       usd.user_id,
       u.username,
       COALESCE(usd.full_name, u.full_name)        AS full_name,
       COALESCE(usd.document_title, ld.title)      AS document_title,
       usd.signed_file_name,
       usd.signed_at,
       usd.ip_address
     FROM user_signed_documents usd
     JOIN users u            ON u.user_id  = usd.user_id::uuid
     JOIN legal_documents ld ON ld.id      = usd.legal_document_id
     ${where}
     ORDER BY usd.signed_at DESC`,
    params
  );

  const header = "id,user_id,username,full_name,document_title,signed_file_name,signed_at,ip_address\n";
  const body   = rows.rows.map(r =>
    [r.id, r.user_id, r.username, `"${r.full_name || ""}"`,
     `"${r.document_title || ""}"`, r.signed_file_name,
     r.signed_at?.toISOString() || "", r.ip_address || ""]
      .join(",")
  ).join("\n");

  return header + body;
};