const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const DEFAULT_TENANT_ID = "7d9e33cc-6a5f-4bd4-a76c-bdcb60b03d58";

// ==================== SIGNUP ====================

exports.signup = async (body) => {
  const { username, full_name, email, phone, password, requested_role, company_details } = body;

  if (!username || !password || !email) {
    throw new Error("Username, email and password are required");
  }

  // Check if username or email already exists
  const existing = await db.query(
    "SELECT user_id FROM users WHERE username = $1 OR email = $2",
    [username, email]
  );
  if (existing.rows.length > 0) {
    throw new Error("Username or email already exists");
  }

  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 10);

  await db.query(
    `INSERT INTO users
     (user_id, tenant_id, username, full_name, email, contact_number, password_hash,
      requested_role, company_details, status, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_REVIEW', false, NOW())`,
    [userId, DEFAULT_TENANT_ID, username, full_name, email, phone, hashedPassword,
     requested_role || 'Customer', company_details]
  );

  // Audit log
  await db.query(
    `INSERT INTO user_approval_logs (user_id, action, to_status, notes, created_at)
     VALUES ($1, 'SIGNUP', 'PENDING_REVIEW', 'New user registration', NOW())`,
    [userId]
  );

  // Email all active admins
  try {
    const emailService = require("./email.service");
    const admins = await db.query(
      `SELECT u.email FROM users u
       JOIN user_roles ur ON u.user_id = ur.user_id
       JOIN roles r ON ur.role_id = r.role_id
       WHERE LOWER(r.role_name) LIKE '%admin%' AND u.status = 'ACTIVE' AND u.email IS NOT NULL`
    );
    for (const admin of admins.rows) {
      emailService.sendEmail(admin.email, `New Signup Request: ${username}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px;border-radius:12px 12px 0 0;color:white">
            <h1 style="margin:0;font-size:20px">New User Registration</h1>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p><strong>Username:</strong> ${username}</p>
            <p><strong>Full Name:</strong> ${full_name || 'N/A'}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
            <p><strong>Requested Role:</strong> ${requested_role || 'Customer'}</p>
            <p><strong>Company Details:</strong> ${company_details || 'N/A'}</p>
            <p style="color:#6b7280;font-size:13px;margin-top:16px">Login to the portal → User Approvals to review.</p>
          </div>
        </div>`
      ).catch(() => {});
    }
  } catch (e) {
    console.error("Email notification error:", e.message);
  }

  // Also create inbox notification for admins
  try {
    const contentRes = await db.query(
      `INSERT INTO content (title, message, type, priority, created_by)
       VALUES ($1, $2, 'MESSAGE', 'high', $3) RETURNING id`,
      [`New Signup: ${username}`, `${full_name || username} (${email}) has registered as ${requested_role}. Company: ${company_details || 'N/A'}`, userId]
    );
    await db.query(
      `INSERT INTO content_targets (content_id, target_type, target_value) VALUES ($1, 'ROLE', 'Administrator')`,
      [contentRes.rows[0].id]
    );
  } catch (e) {
    console.error("Inbox notification error:", e.message);
  }

  return { user_id: userId, message: "Registration submitted. Pending admin review." };
};

// ==================== ADMIN: GET PENDING USERS ====================

exports.getPendingUsers = async (status) => {
  let query = `SELECT user_id, username, full_name, email, contact_number, requested_role,
               company_details, status, erp_entity_type, erp_entity_code, is_active,
               created_at, approved_at, approved_by, rejection_reason
               FROM users WHERE status != 'ACTIVE' OR status IS NULL`;
  const params = [];
  if (status) {
    query = `SELECT user_id, username, full_name, email, contact_number, requested_role,
             company_details, status, erp_entity_type, erp_entity_code, is_active,
             created_at, approved_at, approved_by, rejection_reason
             FROM users WHERE status = $1`;
    params.push(status);
  }
  query += " ORDER BY created_at DESC";
  const result = await db.query(query, params);
  return result.rows;
};

// ==================== ADMIN: GET USER DETAIL ====================

exports.getUserDetail = async (userId) => {
  const user = await db.query(
    `SELECT user_id, username, full_name, email, contact_number, whatsapp_number,
            requested_role, company_details, status, erp_entity_type, erp_entity_code,
            is_active, created_at, approved_at, approved_by, rejection_reason
     FROM users WHERE user_id = $1`,
    [userId]
  );
  if (user.rows.length === 0) throw new Error("User not found");

  const logs = await db.query(
    "SELECT * FROM user_approval_logs WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );

  const signatures = await db.query(
    `SELECT uls.*, ld.title, ld.file_url, ld.file_name
     FROM user_legal_signatures uls
     JOIN legal_documents ld ON uls.legal_document_id = ld.id
     WHERE uls.user_id = $1
     ORDER BY uls.signed_at DESC`,
    [userId]
  );

  return {
    user: user.rows[0],
    logs: logs.rows,
    signatures: signatures.rows
  };
};

// ==================== ADMIN: SEND FOR VERIFICATION ====================

exports.sendForVerification = async (admin, userId, body) => {
  const { erp_entity_type, erp_entity_code, role_id } = body;

  // Update user with ERP code and status
  await db.query(
    `UPDATE users SET
       status = 'IN_VERIFICATION',
       erp_entity_type = COALESCE($1, erp_entity_type),
       erp_entity_code = COALESCE($2, erp_entity_code)
     WHERE user_id = $3`,
    [erp_entity_type || null, erp_entity_code || null, userId]
  );

  // Assign role if provided
  if (role_id) {
    await db.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
    await db.query(
      "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
      [userId, role_id]
    );
  }

  // Audit log
  await db.query(
    `INSERT INTO user_approval_logs
     (user_id, action, from_status, to_status, performed_by, notes, created_at)
     VALUES ($1, 'SEND_VERIFICATION', 'PENDING_REVIEW', 'IN_VERIFICATION', $2, 'Legal docs sent for signing', NOW())`,
    [userId, admin.user_id]
  );

  // Send all active legal documents to user's inbox
  const legalDocs = await db.query(
    "SELECT * FROM legal_documents WHERE is_active = true"
  );
  for (const doc of legalDocs.rows) {
    const contentRes = await db.query(
      `INSERT INTO content (title, message, type, file_url, file_name, priority, created_by)
       VALUES ($1, $2, 'DOCUMENT', $3, $4, 'high', $5) RETURNING id`,
      [
        doc.title,
        doc.description || 'Please review this document carefully and provide your digital signature to acknowledge.',
        doc.file_url,
        doc.file_name,
        admin.user_id
      ]
    );
    await db.query(
      `INSERT INTO content_targets (content_id, target_type, target_value)
       VALUES ($1, 'USER', $2)`,
      [contentRes.rows[0].id, userId]
    );
  }

  // Email user
  try {
    const emailService = require("./email.service");
    const userResult = await db.query(
      "SELECT email, username FROM users WHERE user_id = $1", [userId]
    );
    if (userResult.rows[0]?.email) {
      emailService.sendEmail(userResult.rows[0].email,
        "Action Required: Review & Sign Legal Documents",
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:24px;border-radius:12px 12px 0 0;color:white">
            <h1 style="margin:0;font-size:20px">Verification Required</h1>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p>Hello ${userResult.rows[0].username},</p>
            <p>Your account is under verification. Please:</p>
            <ol>
              <li>Login to the Self-Order Portal</li>
              <li>Go to your <strong>Inbox</strong></li>
              <li>Review the legal documents</li>
              <li>Provide your <strong>digital signature</strong> on each document</li>
              <li>Click <strong>Submit for Approval</strong></li>
            </ol>
            <p style="color:#6b7280;font-size:13px">Your account will be fully activated after admin reviews your signatures.</p>
          </div>
        </div>`
      ).catch(() => {});
    }
  } catch (e) {
    console.error("Email error:", e.message);
  }

  return { message: "Sent for verification. Legal documents delivered to user inbox." };
};

// ==================== ADMIN: APPROVE USER ====================

exports.approveUser = async (admin, userId) => {
  await db.query(
    `UPDATE users SET
       status = 'ACTIVE',
       is_active = true,
       approved_by = $1,
       approved_at = NOW()
     WHERE user_id = $2`,
    [admin.user_id, userId]
  );

  // Audit log
  await db.query(
    `INSERT INTO user_approval_logs
     (user_id, action, from_status, to_status, performed_by, notes, created_at)
     VALUES ($1, 'APPROVE', 'PENDING_APPROVAL', 'ACTIVE', $2, 'Account approved by admin', NOW())`,
    [userId, admin.user_id]
  );

  // Email user
  try {
    const emailService = require("./email.service");
    const userResult = await db.query(
      "SELECT email, username FROM users WHERE user_id = $1", [userId]
    );
    if (userResult.rows[0]?.email) {
      emailService.sendEmail(userResult.rows[0].email,
        "Account Approved! Welcome to Self-Order Portal",
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px;border-radius:12px 12px 0 0;color:white">
            <h1 style="margin:0;font-size:20px">Account Approved!</h1>
            <p style="margin:8px 0 0;opacity:0.9">You now have full access</p>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p>Hello ${userResult.rows[0].username},</p>
            <p>Your account has been approved. You now have full access to the Self-Order Portal.</p>
            <p>Login and start using all features based on your assigned role.</p>
          </div>
        </div>`
      ).catch(() => {});
    }
  } catch (e) {
    console.error("Email error:", e.message);
  }

  return { message: "User approved and activated" };
};

// ==================== ADMIN: REJECT USER ====================

exports.rejectUser = async (admin, userId, body) => {
  const reason = body.reason || 'No reason provided';

  await db.query(
    "UPDATE users SET status = 'REJECTED', is_active = false, rejection_reason = $1 WHERE user_id = $2",
    [reason, userId]
  );

  // Audit log
  await db.query(
    `INSERT INTO user_approval_logs
     (user_id, action, to_status, performed_by, notes, created_at)
     VALUES ($1, 'REJECT', 'REJECTED', $2, $3, NOW())`,
    [userId, admin.user_id, reason]
  );

  // Email user
  try {
    const emailService = require("./email.service");
    const userResult = await db.query(
      "SELECT email, username FROM users WHERE user_id = $1", [userId]
    );
    if (userResult.rows[0]?.email) {
      emailService.sendEmail(userResult.rows[0].email,
        "Account Registration Update",
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#ef4444;padding:24px;border-radius:12px 12px 0 0;color:white">
            <h1 style="margin:0;font-size:20px">Registration Update</h1>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p>Hello ${userResult.rows[0].username},</p>
            <p>Your account registration has been reviewed. Unfortunately, it was not approved at this time.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p style="color:#6b7280;font-size:13px">Please contact support for more information.</p>
          </div>
        </div>`
      ).catch(() => {});
    }
  } catch (e) {
    console.error("Email error:", e.message);
  }

  return { message: "User rejected" };
};

// ==================== ADMIN: UPDATE ROLE ====================

exports.updateRole = async (admin, userId, body) => {
  if (body.role_id) {
    await db.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
    await db.query(
      "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
      [userId, body.role_id]
    );
  }
  if (body.requested_role) {
    await db.query(
      "UPDATE users SET requested_role = $1 WHERE user_id = $2",
      [body.requested_role, userId]
    );
  }

  // Audit log
  await db.query(
    `INSERT INTO user_approval_logs
     (user_id, action, performed_by, notes, created_at)
     VALUES ($1, 'ROLE_CHANGE', $2, $3, NOW())`,
    [userId, admin.user_id, `Role updated to ${body.requested_role || body.role_id}`]
  );

  return { message: "Role updated" };
};

// ==================== USER: GET LEGAL DOCUMENTS ====================

exports.getLegalDocuments = async (user) => {
  const docs = await db.query(
    "SELECT * FROM legal_documents WHERE is_active = true ORDER BY id"
  );

  const signed = await db.query(
    "SELECT legal_document_id FROM user_legal_signatures WHERE user_id = $1",
    [user.user_id]
  );
  const signedIds = new Set(signed.rows.map(s => s.legal_document_id));

  return docs.rows.map(d => ({
    ...d,
    is_signed: signedIds.has(d.id)
  }));
};

// ==================== USER: SUBMIT SIGNATURES ====================

exports.submitSignatures = async (user, body) => {
  const { signatures } = body;
  // signatures: [{ legal_document_id: 1, signature_image: "data:image/png;base64,..." }]

  if (!signatures || signatures.length === 0) {
    throw new Error("No signatures provided");
  }

  for (const sig of signatures) {
    // Store signature in DB
    await db.query(
      `INSERT INTO user_legal_signatures
       (user_id, legal_document_id, signature_image, signed_at, ip_address)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT DO NOTHING`,
      [user.user_id, sig.legal_document_id, sig.signature_image, body.ip_address || '']
    );

    // Upload to DigitalOcean Spaces (Legaldocs folder)
    try {
      const userResult = await db.query(
        "SELECT username FROM users WHERE user_id = $1", [user.user_id]
      );
      const username = userResult.rows[0]?.username || user.user_id;

      // If you have Spaces configured, upload the signed image
      if (process.env.SPACES_ENDPOINT && process.env.SPACES_KEY) {
        const AWS = require("aws-sdk");
        const spacesEndpoint = new AWS.Endpoint(process.env.SPACES_ENDPOINT);
        const s3 = new AWS.S3({
          endpoint: spacesEndpoint,
          accessKeyId: process.env.SPACES_KEY,
          secretAccessKey: process.env.SPACES_SECRET,
        });

        const buffer = Buffer.from(
          sig.signature_image.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        const key = `Legaldocs/${username}_doc_${sig.legal_document_id}_${Date.now()}.png`;

        await s3.putObject({
          Bucket: process.env.SPACES_BUCKET || "portaluploaddocs",
          Key: key,
          Body: buffer,
          ContentType: "image/png",
          ACL: "public-read",
        }).promise();

        const fileUrl = `https://${process.env.SPACES_BUCKET}.${process.env.SPACES_ENDPOINT.replace('https://', '')}/${key}`;

        await db.query(
          "UPDATE user_legal_signatures SET signed_file_url = $1 WHERE user_id = $2 AND legal_document_id = $3",
          [fileUrl, user.user_id, sig.legal_document_id]
        );
      }
    } catch (uploadErr) {
      console.error("Spaces upload error:", uploadErr.message);
      // Don't fail the whole operation if upload fails
    }
  }

  // Update user status to PENDING_APPROVAL
  await db.query(
    "UPDATE users SET status = 'PENDING_APPROVAL' WHERE user_id = $1",
    [user.user_id]
  );

  // Audit log
  await db.query(
    `INSERT INTO user_approval_logs
     (user_id, action, from_status, to_status, notes, created_at)
     VALUES ($1, 'SUBMIT_SIGNATURES', 'IN_VERIFICATION', 'PENDING_APPROVAL', $2, NOW())`,
    [user.user_id, `Signed ${signatures.length} document(s)`]
  );

  // Notify admins via email + inbox
  try {
    const emailService = require("./email.service");
    const userResult = await db.query(
      "SELECT username, full_name FROM users WHERE user_id = $1", [user.user_id]
    );
    const displayName = userResult.rows[0]?.full_name || userResult.rows[0]?.username;

    // Email admins
    const admins = await db.query(
      `SELECT u.email FROM users u
       JOIN user_roles ur ON u.user_id = ur.user_id
       JOIN roles r ON ur.role_id = r.role_id
       WHERE LOWER(r.role_name) LIKE '%admin%' AND u.status = 'ACTIVE' AND u.email IS NOT NULL`
    );
    for (const admin of admins.rows) {
      emailService.sendEmail(admin.email,
        `Documents Signed: ${displayName} — Ready for Approval`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#8b5cf6,#6366f1);padding:24px;border-radius:12px 12px 0 0;color:white">
            <h1 style="margin:0;font-size:20px">Documents Signed</h1>
            <p style="margin:8px 0 0;opacity:0.9">Pending your final approval</p>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p><strong>${displayName}</strong> has signed all ${signatures.length} legal document(s) and is pending your final approval.</p>
            <p>Login to the portal → User Approvals to review and approve.</p>
          </div>
        </div>`
      ).catch(() => {});
    }

    // Inbox notification for admins
    const contentRes = await db.query(
      `INSERT INTO content (title, message, type, priority, created_by)
       VALUES ($1, $2, 'MESSAGE', 'high', $3) RETURNING id`,
      [`${displayName} signed legal documents`, `${displayName} has signed all legal documents and is pending final approval.`, user.user_id]
    );
    await db.query(
      `INSERT INTO content_targets (content_id, target_type, target_value) VALUES ($1, 'ROLE', 'Administrator')`,
      [contentRes.rows[0].id]
    );
  } catch (e) {
    console.error("Notification error:", e.message);
  }

  return { message: "Documents submitted for approval. Admin will review shortly." };
};

// ==================== ADMIN: LEGAL TEMPLATES ====================

exports.getLegalTemplates = async () => {
  const result = await db.query(
    "SELECT * FROM legal_documents ORDER BY created_at DESC"
  );
  return result.rows;
};

exports.createLegalTemplate = async (admin, body) => {
  const result = await db.query(
    `INSERT INTO legal_documents (title, description, file_url, file_name, is_active, created_by, created_at)
     VALUES ($1, $2, $3, $4, true, $5, NOW()) RETURNING *`,
    [body.title, body.description, body.file_url, body.file_name, admin.user_id]
  );
  return result.rows[0];
};
