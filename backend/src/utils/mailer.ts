import nodemailer, { type Transporter } from "nodemailer";

const getSmtpConfig = () => {
  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const user = String(process.env.SMTP_USER || "").trim();
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

let cachedTransporter: Transporter | null = null;
let cachedTransportKey = "";

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

  const transportKey = JSON.stringify({ host, port, secure, service, user, pass: cleanPass });
  if (cachedTransporter && cachedTransportKey === transportKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    ...(service ? { service } : {}),
    host,
    port,
    secure,
    requireTLS: !secure,
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user,
      pass: cleanPass,
    },
  });
  cachedTransportKey = transportKey;
  return cachedTransporter;
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
    const info = (await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    })) as {
      messageId?: string;
      accepted?: unknown[];
      rejected?: unknown[];
      response?: string;
    };

    return {
      skipped: false as const,
      messageId: info.messageId,
      accepted: (info.accepted || []).map(String),
      rejected: (info.rejected || []).map(String),
      response: info.response,
    };
  } catch (err: any) {
    console.error("📧 SMTP sendMail failed:", err.message);
    console.error("   Response code:", err.responseCode, "| Command:", err.command);
    console.error("   ➜ If 535 BadCredentials: generate a fresh Gmail App Password and update SMTP_PASS.");
    console.error("   ➜ If account has Advanced Protection or 2FA disabled, app passwords may be blocked.");
    throw err;
  }
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
  const text = `${payload.actorEmail} shared "${payload.documentTitle}" with you as ${payload.role}.\n\nOpen: ${safeUrl}\n\nSign in with ${payload.to} to access it.`;

  const html = `
    <div style="margin:0;padding:0;background:#f5f7f6;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:560px;margin:0 auto;padding:28px 18px">
        <div style="border:1px solid #dbe4df;background:#ffffff;border-radius:14px;overflow:hidden">
          <div style="padding:22px 24px;border-bottom:1px solid #edf2ef;background:#0f1713;color:#ffffff">
            <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#5ee6a8;font-weight:800">Editorial</div>
            <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800">Document access granted</h1>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">
              <strong style="color:#111827">${safeActor}</strong> shared this document with you.
            </p>
            <div style="margin:18px 0;padding:16px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa">
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;font-weight:800">Document</div>
              <div style="margin-top:6px;font-size:18px;line-height:1.35;font-weight:800;color:#111827">${safeTitle}</div>
              <div style="margin-top:12px">
                <span style="display:inline-block;border-radius:999px;background:#dcfce7;color:#166534;padding:5px 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em">${safeRole}</span>
              </div>
            </div>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4b5563">Sign in with <strong>${escapeHtml(payload.to)}</strong> to open it.</p>
            <a href="${escapeHtml(safeUrl)}" style="display:inline-block;background:#10b981;color:#052e1c;text-decoration:none;border-radius:8px;padding:12px 16px;font-size:14px;font-weight:900">
              Open in Editorial
            </a>
          </div>
          <div style="padding:16px 24px;border-top:1px solid #edf2ef;background:#fafafa;color:#6b7280;font-size:12px;line-height:1.5">
            You received this because a document owner added your email as a collaborator.
          </div>
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to: payload.to,
    subject,
    text,
    html,
  });
};
