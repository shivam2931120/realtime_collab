import crypto from "crypto";
import { isValidEmail, normalizeEmail, userIdFromEmail } from "./userIdentity";

type TokenPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

type AuthUser = {
  id: string;
  email: string;
};

const TOKEN_TTL_SECONDS = Math.max(60, Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 14));

const getTokenSecret = () => {
  const secret = String(process.env.AUTH_TOKEN_SECRET || "").trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_TOKEN_SECRET is required in production");
  }

  return "dev-auth-secret";
};

const TOKEN_SECRET = getTokenSecret();

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

const sign = (payloadSegment: string) =>
  crypto.createHmac("sha256", TOKEN_SECRET).update(payloadSegment).digest("base64url");

const timingSafeEquals = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const buildAuthUser = (emailInput: string): AuthUser => {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) {
    throw new Error("Invalid email");
  }
  return { id: userIdFromEmail(email), email };
};

export const issueAuthToken = (user: AuthUser) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const payloadSegment = toBase64Url(JSON.stringify(payload));
  return `${payloadSegment}.${sign(payloadSegment)}`;
};

export const verifyAuthToken = (token: string): AuthUser => {
  const [payloadSegment, signature] = String(token || "").split(".");
  if (!payloadSegment || !signature) {
    throw new Error("Invalid token format");
  }

  const expected = sign(payloadSegment);
  if (!timingSafeEquals(signature, expected)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(fromBase64Url(payloadSegment)) as TokenPayload;
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || !payload?.email || !payload?.exp || payload.exp < now) {
    throw new Error("Token expired or malformed");
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    throw new Error("Token contains invalid email");
  }

  const expectedUserId = userIdFromEmail(email);
  if (payload.sub !== expectedUserId) {
    throw new Error("Token subject mismatch");
  }

  return { id: payload.sub, email };
};
