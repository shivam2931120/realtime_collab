type EmailJsConfig = {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  apiUrl: string;
  fromName: string;
  replyTo: string;
  minIntervalMs: number;
};

type MailSkippedResult = {
  skipped: true;
  reason: string;
};

type MailSentResult = {
  skipped: false;
  provider: "emailjs";
  messageId?: string;
  accepted: string[];
  rejected: string[];
  response: string;
  status: number;
};

export type MailResult = MailSkippedResult | MailSentResult;

const EMAILJS_SEND_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

const getEmailJsConfig = (): EmailJsConfig => ({
  serviceId: String(process.env.EMAILJS_SERVICE_ID || "").trim(),
  templateId: String(process.env.EMAILJS_TEMPLATE_ID || "").trim(),
  publicKey: String(process.env.EMAILJS_PUBLIC_KEY || "").trim(),
  privateKey: String(process.env.EMAILJS_PRIVATE_KEY || "").trim(),
  apiUrl: String(process.env.EMAILJS_API_URL || EMAILJS_SEND_ENDPOINT).trim(),
  fromName: String(process.env.EMAILJS_FROM_NAME || "Editorial").trim(),
  replyTo: String(process.env.EMAILJS_REPLY_TO || "").trim(),
  minIntervalMs: Math.max(0, Number(process.env.EMAILJS_MIN_INTERVAL_MS || 1100)),
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const missingEmailJsVars = (config = getEmailJsConfig()) => {
  const missing: string[] = [];
  if (!config.serviceId) missing.push("EMAILJS_SERVICE_ID");
  if (!config.templateId) missing.push("EMAILJS_TEMPLATE_ID");
  if (!config.publicKey) missing.push("EMAILJS_PUBLIC_KEY");
  if (!config.privateKey) missing.push("EMAILJS_PRIVATE_KEY");
  return missing;
};

const textToHtml = (text: string) => `
  <div style="font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#111827">
    ${escapeHtml(text).replace(/\n/g, "<br>")}
  </div>
`;

export const getEmailDeliveryStatus = () => {
  const config = getEmailJsConfig();
  const missing = missingEmailJsVars(config);

  return {
    enabled: missing.length === 0,
    missing,
    provider: "emailjs" as const,
    endpoint: config.apiUrl,
    serviceIdSet: Boolean(config.serviceId),
    templateIdSet: Boolean(config.templateId),
    publicKeySet: Boolean(config.publicKey),
    privateKeySet: Boolean(config.privateKey),
  };
};

export const isEmailEnabled = () => getEmailDeliveryStatus().enabled;

export const verifyEmailDeliveryConfig = async () => {
  const status = getEmailDeliveryStatus();
  if (!status.enabled) {
    return {
      ok: false as const,
      reason: `Missing ${status.missing.join(", ")}`,
    };
  }

  return {
    ok: true as const,
    provider: status.provider,
    endpoint: status.endpoint,
    privateKeySet: status.privateKeySet,
  };
};

let emailSendChain = Promise.resolve();
let lastEmailSendAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const enqueueEmailJsSend = async <T>(task: () => Promise<T>, minIntervalMs: number) => {
  const queued = emailSendChain.then(async () => {
    const elapsed = Date.now() - lastEmailSendAt;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }

    const result = await task();
    lastEmailSendAt = Date.now();
    return result;
  });

  emailSendChain = queued.then(
    () => undefined,
    () => undefined,
  );

  return queued;
};

export const sendMail = async (payload: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> => {
  const config = getEmailJsConfig();
  const missing = missingEmailJsVars(config);

  if (missing.length) {
    return {
      skipped: true as const,
      reason: `Missing ${missing.join(", ")}`,
    };
  }

  const templateParams = {
    app_name: "Editorial",
    from_name: config.fromName || "Editorial",
    reply_to: config.replyTo,
    to_email: payload.to,
    to_name: payload.to.split("@")[0] || payload.to,
    recipient_email: payload.to,
    subject: payload.subject,
    text_message: payload.text,
    message: payload.text,
    html_message: payload.html || textToHtml(payload.text),
  };

  try {
    const response = await enqueueEmailJsSend(
      () =>
        fetch(config.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            service_id: config.serviceId,
            template_id: config.templateId,
            user_id: config.publicKey,
            accessToken: config.privateKey || undefined,
            template_params: templateParams,
          }),
        }),
      config.minIntervalMs,
    );
    const responseText = await response.text();

    if (!response.ok) {
      const accountSecurityHint = /non-browser/i.test(responseText)
        ? " Enable Account > Security > API calls from non-browser applications in the EmailJS dashboard."
        : "";
      throw new Error(
        `EmailJS send failed (${response.status}): ${responseText || response.statusText}.${accountSecurityHint}`,
      );
    }

    return {
      skipped: false as const,
      provider: "emailjs",
      accepted: [payload.to],
      rejected: [],
      response: responseText || "OK",
      status: response.status,
    };
  } catch (err: any) {
    console.error("EmailJS sendMail failed:", err?.message || err);
    console.error("Check EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, and the template To Email field.");
    throw err;
  }
};

export const sendPasswordResetEmail = async (payload: { to: string; resetUrl: string }) => {
  const safeUrl = payload.resetUrl;

  const subject = "Reset your password";
  const text = `A password reset was requested for your account.\n\nOpen this link to set a new password (valid for 30 minutes):\n${safeUrl}\n\nIf you didn't request this, you can ignore this email.`;

  const html = `
    <div style="font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p style="margin:0 0 12px">A password reset was requested for your account.</p>
      <p style="margin:0 0 16px">This link is valid for <strong>30 minutes</strong>:</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:10px 14px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">
          Reset password
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#444">If you didn't request this, you can ignore this email.</p>
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
