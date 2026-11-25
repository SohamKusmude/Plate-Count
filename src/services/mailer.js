const nodemailer = require("nodemailer");

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !from) throw new Error("SMTP_HOST and SMTP_FROM must be configured.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a valid port.");
  if (Boolean(user) !== Boolean(pass)) throw new Error("SMTP_USER and SMTP_PASS must be configured together.");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {})
  });
  const safeName = escapeHtml(name);
  await transporter.sendMail({
    from,
    to,
    subject: "Reset your Plate Count password",
    text: `Hello ${name},\n\nUse this link to reset your Plate Count password. It expires in one hour:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hello ${safeName},</p><p>Use this link to reset your Plate Count password. It expires in one hour:</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
  });
}

module.exports = { isEmailConfigured, sendPasswordResetEmail };
