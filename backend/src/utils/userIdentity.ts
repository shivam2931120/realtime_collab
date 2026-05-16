const USER_ID_PREFIX = "usr_";
const LEGACY_EMAIL_DOMAIN = "legacy.local";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

export const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

export const isValidEmail = (email: string) => emailPattern.test(email);

export const userIdFromEmail = (email: string) => `${USER_ID_PREFIX}${toBase64Url(normalizeEmail(email))}`;

const legacyEmailFromUserId = (userId: string) =>
  `${String(userId || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown"}@${LEGACY_EMAIL_DOMAIN}`;

export const emailFromUserId = (userId: string) => {
  if (!String(userId || "").startsWith(USER_ID_PREFIX)) {
    return legacyEmailFromUserId(userId);
  }

  const encoded = userId.slice(USER_ID_PREFIX.length);
  try {
    const decoded = normalizeEmail(fromBase64Url(encoded));
    return isValidEmail(decoded) ? decoded : legacyEmailFromUserId(userId);
  } catch {
    return legacyEmailFromUserId(userId);
  }
};
