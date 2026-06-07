"use strict";
const nodemailer = require("nodemailer");

// Per-tenant transporter cache
const transporters = {};

async function getTenantTransporter(tenantId) {
  if (transporters[tenantId]) return transporters[tenantId];

  const TenantSettings = require("../models/tenantSettings.model");
  const s = await TenantSettings.getTenantSettings(tenantId);

  const t = nodemailer.createTransport({
    host:   s.smtp_host   || process.env.SMTP_HOST,
    port:   parseInt(s.smtp_port || process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: s.smtp_user     || process.env.SMTP_USER,
      pass: s.smtp_password || process.env.SMTP_PASS,
    },
  });

  transporters[tenantId] = { transporter: t, from: s.smtp_from || process.env.SMTP_FROM };
  return transporters[tenantId];
}

// Default transporter (env-based) for cases where we don't have tenantId yet
const defaultTransporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

defaultTransporter.verify()
  .then(() => console.log("✅ SMTP connection ready"))
  .catch(err => console.error("❌ SMTP connection failed:", err.message));

// Main send function — accepts optional tenantId for per-tenant SMTP
const sendEmail = async (to, subject, html, tenantId = null) => {
  try {
    let t, from;
    if (tenantId) {
      const cfg = await getTenantTransporter(tenantId);
      t    = cfg.transporter;
      from = cfg.from;
    } else {
      t    = defaultTransporter;
      from = process.env.SMTP_FROM || "Self-Order Portal <noreply@tema-global.com>";
    }

    const info = await t.sendMail({ from, to, subject, html });
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("❌ Email send error:", err.message);
    throw err;
  }
};

exports.sendEmail = sendEmail;
exports.clearTransporterCache = (tenantId) => {
  if (tenantId) delete transporters[tenantId];
  else Object.keys(transporters).forEach(k => delete transporters[k]);
};

// ── Specific email senders ────────────────────────────────────
exports.sendNewSalesRequestEmail = async (email, data, tenantId) => {
  if (!email) return;
  await sendEmail(email, `New Sales Request: ${data.drop_request_id}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">New Sales Request</h1>
        <p style="margin:8px 0 0;opacity:0.9">${data.drop_request_id} — $${Number(data.total_amount).toFixed(2)}</p>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p><strong>Customer:</strong> ${data.customer_code}</p>
        <p><strong>Items:</strong> ${data.items?.length || 0}</p>
        <p><strong>Total:</strong> $${Number(data.total_amount).toFixed(2)}</p>
        <p style="color:#6b7280;font-size:13px">Login to the portal to review and process this request.</p>
      </div>
    </div>`, tenantId);
};

exports.sendStatusUpdateEmail = async (email, data, tenantId) => {
  if (!email) return;
  const colors = { "Order Generated": "#3b82f6", Completed: "#10b981", "Delivery Scheduled": "#8b5cf6" };
  const color = colors[data.status] || "#6366f1";
  await sendEmail(email, `Sales Request ${data.drop_request_id} — ${data.status}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:${color};padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">Order Status Update</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:24px;font-weight:bold;color:${color}">${data.status}</p>
        ${data.erp_order_no ? `<p><strong>ERP Order:</strong> ${data.erp_order_no}</p>` : ""}
        <p><strong>Customer:</strong> ${data.customer_code}</p>
      </div>
    </div>`, tenantId);
};

exports.sendContentNotification = async (emails, data, tenantId) => {
  if (!emails?.length) return;
  const labels = { DOCUMENT: "Document", OFFER: "Special Offer", ANNOUNCEMENT: "Announcement", MESSAGE: "Message" };
  for (const email of emails) {
    await sendEmail(email, `${labels[data.type] || "New Content"}: ${data.title}`, `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#6366f1;padding:24px;border-radius:12px 12px 0 0;color:white">
          <h1 style="margin:0;font-size:20px">${labels[data.type] || "New Content"}: ${data.title}</h1>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p>${data.message || ""}</p>
        </div>
      </div>`, tenantId).catch(() => {});
  }
};

exports.sendMessageToAdminEmail = async (senderUsername, body, tenantId) => {
  const TenantSettings = require("../models/tenantSettings.model");
  const settings = tenantId ? await TenantSettings.getTenantSettings(tenantId) : null;
  const adminEmail = settings?.admin_email || process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  await sendEmail(adminEmail, `New Message from ${senderUsername}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#6366f1;padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">New Message from ${senderUsername}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p><strong>${body.title || "Message"}</strong></p>
        <p>${body.message || ""}</p>
      </div>
    </div>`, tenantId).catch(() => {});
};
