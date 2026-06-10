"use strict";
const crypto  = require("crypto");
const db      = require("../config/db");
const emailSvc = require("./email.service");

// ── Request password reset ────────────────────────────────────────
exports.requestReset = async (identifier, tenantId) => {
  // Find user by username OR email (case-insensitive)
  const result = await db.query(
    `SELECT user_id, email, username, tenant_id
     FROM users
     WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1))
     AND is_active = true
     LIMIT 1`,
    [identifier]
  );

  // Always return success — never reveal if user exists (anti-enumeration)
  if (!result.rows.length) return { success: true };

  const user = result.rows[0];
  if (!user.email) return { success: true }; // no email on file

  // Invalidate any existing unused tokens for this user
  await db.query(
    `UPDATE password_reset_tokens SET used = true
     WHERE user_id = $1 AND used = false`,
    [user.user_id]
  );

  // Generate secure token
  const token     = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user.user_id, token, expiresAt]
  );

  // Get tenant settings for portal URL
  let portalUrl = process.env.PORTAL_URL || "https://shark-app-tt8ea.ondigitalocean.app";
  try {
    const TenantSettings = require("../models/tenantSettings.model");
    const settings = await TenantSettings.getTenantSettings(user.tenant_id);
    if (settings?.portal_url) portalUrl = settings.portal_url;
  } catch (_) {}

  const resetLink = `${portalUrl}/reset-password?token=${token}`;

  // Send email
  await emailSvc.sendEmail(
    user.email,
    "Reset your password — Unified Commerce Portal",
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;border-radius:12px 12px 0 0;color:white;text-align:center">
        <h1 style="margin:0;font-size:22px">🔐 Password Reset</h1>
        <p style="margin:8px 0 0;opacity:0.85">Unified Commerce Portal</p>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p style="color:#374151">Hi <strong>${user.username}</strong>,</p>
        <p style="color:#374151">We received a request to reset your password. Click the button below to create a new password.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${resetLink}"
             style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">
            Reset My Password
          </a>
        </div>
        <p style="color:#6b7280;font-size:13px">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:16px;word-break:break-all">
          Or copy this link: ${resetLink}
        </p>
      </div>
    </div>`,
    user.tenant_id
  ).catch(err => console.error("Reset email failed:", err.message));

  return { success: true };
};

// ── Verify token (used by frontend to validate before showing form) ─
exports.verifyToken = async (token) => {
  const result = await db.query(
    `SELECT prt.user_id, prt.expires_at, prt.used, u.username
     FROM password_reset_tokens prt
     JOIN users u ON u.user_id = prt.user_id
     WHERE prt.token = $1`,
    [token]
  );

  if (!result.rows.length)
    return { valid: false, reason: "invalid" };

  const row = result.rows[0];
  if (row.used)
    return { valid: false, reason: "used" };
  if (new Date(row.expires_at) < new Date())
    return { valid: false, reason: "expired" };

  return { valid: true, username: row.username };
};

// ── Reset password ─────────────────────────────────────────────────
exports.resetPassword = async (token, newPassword) => {
  if (!newPassword || newPassword.length < 8)
    throw new Error("Password must be at least 8 characters");

  const verify = await exports.verifyToken(token);
  if (!verify.valid)
    throw new Error(verify.reason === "expired" ? "Reset link has expired. Please request a new one." : "Invalid or already used reset link.");

  // Get user_id from token
  const tokenRow = await db.query(
    `SELECT user_id FROM password_reset_tokens WHERE token = $1`,
    [token]
  );
  const userId = tokenRow.rows[0].user_id;

  // Hash new password
  const bcrypt = require("bcrypt");
  const hash   = await bcrypt.hash(newPassword, 10);

  // Update password
  await db.query(
    `UPDATE users SET password_hash = $1 WHERE user_id = $2`,
    [hash, userId]
  );

  // Invalidate token
  await db.query(
    `UPDATE password_reset_tokens SET used = true WHERE token = $1`,
    [token]
  );

  return { success: true };
};
