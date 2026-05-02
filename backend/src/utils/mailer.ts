import nodemailer from "nodemailer";

const getSmtpConfig = () => {
  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const user = String(process.env.SMTP_USER || "").trim().toLowerCase();
  const pass = String(process.env.SMTP_PASS || "");
  const from = String(process.env.SMTP_FROM || user).trim();
  const service = process.env.SMTP_SERVICE ? String(process.env.SMTP_SERVICE).trim() : undefined;

  return {
    host,
    port,
    secure: port === 465,
    service,
    user,
    pass,
    from,
  };
};

export const isEmailEnabled = () => {
  const { user, pass, from } = getSmtpConfig();
  return Boolean(user && pass && from);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getTransporter = () => {
  const { host, port, secure, service, user, pass } = getSmtpConfig();

  if (!user || !pass) {
    throw new Error("SMTP_USER/SMTP_PASS missing");
  }

  const cleanPass = (pass || "").replace(/\s+/g, "");

  return nodemailer.createTransport({
    ...(service ? { service } : {}),
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user,
      pass: cleanPass,
    },
  });
};

export const verifySmtpConnection = async () => {
  if (!isEmailEnabled()) {
    return { ok: false as const, reason: "SMTP creds missing" };
  }

  const transporter = getTransporter();
  await transporter.verify();
  return { ok: true as const };
};

export const sendMail = async (payload: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => {
  if (!isEmailEnabled()) {
    return { skipped: true as const };
  }

  const { from } = getSmtpConfig();

  if (!from) {
    throw new Error("SMTP_FROM missing");
  }

  const transporter = getTransporter();

  try {
    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  } catch (err: any) {
    console.error("📧 SMTP sendMail failed:", err.message);
    console.error("   Response code:", err.responseCode, "| Command:", err.command);
    console.error("   ➜ If 535 BadCredentials: generate a fresh Gmail App Password and update SMTP_PASS.");
    console.error("   ➜ If account has Advanced Protection or 2FA disabled, app passwords may be blocked.");
    throw err;
  }

  return { skipped: false as const };
};

export const sendPasswordResetEmail = async (payload: { to: string; resetUrl: string }) => {
  const safeUrl = payload.resetUrl;

  const subject = "Reset your password";
  const text = `A password reset was requested for your account.\n\nOpen this link to set a new password (valid for 30 minutes):\n${safeUrl}\n\nIf you didn't request this, you can ignore this email.`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.6; color: #111">
      <h2 style="margin: 0 0 12px">Reset your password</h2>
      <p style="margin: 0 0 12px">A password reset was requested for your account.</p>
      <p style="margin: 0 0 16px">This link is valid for <strong>30 minutes</strong>:</p>
      <p style="margin: 0 0 20px">
        <a href="${escapeHtml(safeUrl)}" style="display: inline-block; padding: 10px 14px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700">
          Reset password
        </a>
      </p>
      <p style="margin: 0; font-size: 13px; color: #444">If you didn't request this, you can ignore this email.</p>
    </div>
  `;

  return sendMail({
    to: payload.to,
    subject,
    text,
    html,
  });
};

export const sendDocumentSharedEmail = async (payload: {
  to: string;
  actorEmail: string;
  documentTitle: string;
  documentUrl: string;
  role: "editor" | "viewer";
}) => {
  const safeTitle = escapeHtml(payload.documentTitle);
  const safeActor = escapeHtml(payload.actorEmail);
  const safeUrl = payload.documentUrl;
  const safeRole = escapeHtml(payload.role);

  const subject = `Access granted: ${payload.documentTitle}`;
  const text = `${payload.actorEmail} shared "${payload.documentTitle}" with you as ${payload.role}.\n\nOpen: ${safeUrl}`;

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.6; color: #111">
      <h2 style="margin: 0 0 12px">Document shared with you</h2>
      <p style="margin: 0 0 12px"><strong>${safeActor}</strong> shared <strong>"${safeTitle}"</strong> with you as <strong>${safeRole}</strong>.</p>
      <p style="margin: 0 0 20px">
        <a href="${escapeHtml(safeUrl)}" style="display: inline-block; padding: 10px 14px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700">
          Open document
        </a>
      </p>
      <p style="margin: 0; font-size: 13px; color: #444">If you don't have access, make sure you're signed in with <strong>${escapeHtml(payload.to)}</strong>.</p>
    </div>
  `;

  return sendMail({
    to: payload.to,
    subject,
    text,
    html,
  });
};
