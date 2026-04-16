const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // SSL for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify connection on startup
transporter.verify().then(() => {
  console.log("✅ SMTP connection ready");
}).catch((err) => {
  console.error("❌ SMTP connection failed:", err.message);
});

const sendEmail = async (to, subject, html) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || "Self-Order Portal <noreply@tema-global.com>",
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`❌ Email failed to ${to}:`, err.message);
    // Don't throw - email failure shouldn't break the main flow
  }
};

// ========== EMAIL TEMPLATES ==========

exports.sendSalesRequestConfirmation = async (customerEmail, data) => {
  if (!customerEmail) return;
  const itemRows = data.items.map(i =>
    `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i.prod_desc || i.product_code}</td>
     <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
     <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${(i.price * i.quantity).toFixed(2)}</td></tr>`
  ).join("");

  await sendEmail(customerEmail, `Sales Request ${data.drop_request_id} Submitted`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">Sales Request Confirmed</h1>
        <p style="margin:8px 0 0;opacity:0.9">Your order has been submitted successfully</p>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p style="margin:0 0 16px;color:#374151"><strong>Request ID:</strong> ${data.drop_request_id}</p>
        <p style="margin:0 0 16px;color:#374151"><strong>Customer:</strong> ${data.customer_code}</p>
        <p style="margin:0 0 16px;color:#374151"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="background:#f9fafb">
            <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Product</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #e5e7eb">Qty</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Amount</th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr><td colspan="2" style="padding:8px;text-align:right;font-weight:bold">Total</td>
            <td style="padding:8px;text-align:right;font-weight:bold;color:#6366f1">$${data.total_amount.toFixed(2)}</td></tr></tfoot>
        </table>
        <p style="margin:16px 0 0;color:#6b7280;font-size:13px">You can track your order in the Self-Order Portal.</p>
      </div>
    </div>
  `);
};

exports.sendSalesRequestAdminAlert = async (data) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  await sendEmail(adminEmail, `New Sales Request: ${data.drop_request_id}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#ef4444;padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">New Sales Request</h1>
        <p style="margin:8px 0 0;opacity:0.9">${data.drop_request_id} — $${data.total_amount.toFixed(2)}</p>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p><strong>Customer:</strong> ${data.customer_code}</p>
        <p><strong>Items:</strong> ${data.items.length}</p>
        <p><strong>Total:</strong> $${data.total_amount.toFixed(2)}</p>
        <p><strong>Address:</strong> ${data.address || 'N/A'}</p>
        <p style="color:#6b7280;font-size:13px;margin-top:16px">Login to the portal to review and process this request.</p>
      </div>
    </div>
  `);
};

exports.sendStatusUpdateEmail = async (email, data) => {
  if (!email) return;
  const statusColors = { 'Order Generated': '#3b82f6', 'Completed': '#10b981', 'Delivery Scheduled': '#8b5cf6' };
  const color = statusColors[data.status] || '#6366f1';

  await sendEmail(email, `Sales Request ${data.drop_request_id} — ${data.status}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:${color};padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">Order Status Update</h1>
        <p style="margin:8px 0 0;opacity:0.9">${data.drop_request_id}</p>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;margin-bottom:16px">
          <p style="margin:0;color:#6b7280;font-size:13px">Status</p>
          <p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:${color}">${data.status}</p>
        </div>
        ${data.erp_order_no ? `<p><strong>ERP Order:</strong> ${data.erp_order_no}</p>` : ''}
        <p><strong>Customer:</strong> ${data.customer_code}</p>
        <p style="color:#6b7280;font-size:13px;margin-top:16px">Login to the portal for full details.</p>
      </div>
    </div>
  `);
};

exports.sendContentNotification = async (emails, data) => {
  if (!emails || emails.length === 0) return;
  const typeLabels = { DOCUMENT: 'Document', OFFER: 'Special Offer', ANNOUNCEMENT: 'Announcement', MESSAGE: 'Message' };

  for (const email of emails) {
    await sendEmail(email, `${typeLabels[data.type] || 'New Content'}: ${data.title}`, `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#6366f1;padding:24px;border-radius:12px 12px 0 0;color:white">
          <h1 style="margin:0;font-size:20px">${typeLabels[data.type] || 'New Content'}</h1>
          <p style="margin:8px 0 0;opacity:0.9">${data.title}</p>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="color:#374151">${data.message}</p>
          ${data.expiry_date ? `<p style="color:#ef4444;font-size:13px">Expires: ${new Date(data.expiry_date).toLocaleDateString()}</p>` : ''}
          <p style="color:#6b7280;font-size:13px;margin-top:16px">Login to the portal to view and acknowledge.</p>
        </div>
      </div>
    `);
  }
};

exports.sendMessageToAdminEmail = async (senderName, data) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  await sendEmail(adminEmail, `Message from ${senderName}: ${data.title}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#8b5cf6;padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">New Message</h1>
        <p style="margin:8px 0 0;opacity:0.9">From: ${senderName}</p>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p><strong>Subject:</strong> ${data.title}</p>
        <div style="padding:16px;background:#f9fafb;border-radius:8px;margin:16px 0">
          <p style="margin:0;color:#374151">${data.message}</p>
        </div>
        <p style="color:#6b7280;font-size:13px">Login to the portal to respond.</p>
      </div>
    </div>
  `);
};

exports.sendWelcomeEmail = async (email, data) => {
  if (!email) return;

  await sendEmail(email, `Welcome to Self-Order Portal`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;border-radius:12px 12px 0 0;color:white">
        <h1 style="margin:0;font-size:20px">Welcome!</h1>
        <p style="margin:8px 0 0;opacity:0.9">Your account has been created</p>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <p>Hello <strong>${data.username}</strong>,</p>
        <p>Your Self-Order Portal account is ready. Here are your login details:</p>
        <div style="padding:16px;background:#f9fafb;border-radius:8px;margin:16px 0">
          <p style="margin:0"><strong>Username:</strong> ${data.username}</p>
          <p style="margin:8px 0 0"><strong>Role:</strong> ${data.role}</p>
        </div>
        <p style="color:#6b7280;font-size:13px">Please change your password after first login.</p>
      </div>
    </div>
  `);
};