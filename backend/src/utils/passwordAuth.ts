import crypto from "crypto";
import { supabase } from "../config/supabase";
import { buildAuthUser, issueAuthToken } from "./authToken";
import { emailFromUserId, normalizeEmail } from "./userIdentity";
import { isMissingTableError } from "./dbErrors";

const SCRYPT_KEY_LENGTH = 64;
const REFRESH_TOKEN_TTL_DAYS = 30;
const RESET_TOKEN_TTL_MINUTES = 30;
const FALLBACK_AUTH_OWNER_ID = "__auth_system__";
const FALLBACK_REFRESH_PREFIX = "fallback_refresh.";
const FALLBACK_RESET_PREFIX = "fallback_reset.";

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const createRandomToken = () => crypto.randomBytes(48).toString("base64url");

const getFallbackSecret = () =>
  String(process.env.AUTH_TOKEN_SECRET || process.env.SUPABASE_SERVICE_KEY || "dev-auth-secret");

const signFallbackPayload = (payloadSegment: string) =>
  crypto.createHmac("sha256", getFallbackSecret()).update(payloadSegment).digest("base64url");

const toBase64UrlJson = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString("base64url");

const parseBase64UrlJson = <T>(value: string) => JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;

const issueFallbackToken = (prefix: string, payload: Record<string, unknown>) => {
  const payloadSegment = toBase64UrlJson(payload);
  return `${prefix}${payloadSegment}.${signFallbackPayload(payloadSegment)}`;
};

const verifyFallbackToken = <T extends { exp?: number; purpose?: string }>(
  token: string,
  prefix: string,
  purpose: string,
) => {
  const raw = String(token || "");
  if (!raw.startsWith(prefix)) {
    throw new Error("Invalid fallback token");
  }

  const [payloadSegment, signature] = raw.slice(prefix.length).split(".");
  if (!payloadSegment || !signature || signFallbackPayload(payloadSegment) !== signature) {
    throw new Error("Invalid fallback token signature");
  }

  const payload = parseBase64UrlJson<T>(payloadSegment);
  if (payload.purpose !== purpose || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Fallback token expired or malformed");
  }

  return payload;
};

const fallbackUserTitle = (email: string) => `auth:user:${normalizeEmail(email)}`;

const parseFallbackUser = (content: string) => {
  const parsed = JSON.parse(content || "{}") as { id?: string; email?: string; password_hash?: string };
  if (!parsed.id || !parsed.email || !parsed.password_hash) {
    return null;
  }
  return parsed as { id: string; email: string; password_hash: string };
};

export const findFallbackAuthUserByEmail = async (emailInput: string) => {
  const email = normalizeEmail(emailInput);
  const { data, error } = await supabase
    .from("documents")
    .select("content")
    .eq("owner_id", FALLBACK_AUTH_OWNER_ID)
    .eq("title", fallbackUserTitle(email))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.content ? parseFallbackUser(data.content) : null;
};

export const createFallbackAuthUser = async (user: { id: string; email: string }, passwordHash: string) => {
  const { error } = await supabase.from("documents").insert({
    title: fallbackUserTitle(user.email),
    content: JSON.stringify({ id: user.id, email: user.email, password_hash: passwordHash }),
    owner_id: FALLBACK_AUTH_OWNER_ID,
  });

  if (error) {
    throw error;
  }
};

export const updateFallbackAuthPassword = async (userId: string, passwordHash: string) => {
  const email = emailFromUserId(userId);
  const existing = await findFallbackAuthUserByEmail(email);
  if (!existing) {
    throw new Error("Fallback user not found");
  }

  const { error } = await supabase
    .from("documents")
    .update({
      content: JSON.stringify({ ...existing, password_hash: passwordHash }),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", FALLBACK_AUTH_OWNER_ID)
    .eq("title", fallbackUserTitle(email));

  if (error) {
    throw error;
  }
};

export const hashPassword = (password: string) => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("base64url")}:${key.toString("base64url")}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
  const [scheme, saltValue, keyValue] = String(storedHash || "").split(":");
  if (scheme !== "scrypt" || !saltValue || !keyValue) {
    return false;
  }

  const salt = Buffer.from(saltValue, "base64url");
  const expectedKey = Buffer.from(keyValue, "base64url");
  const actualKey = crypto.scryptSync(password, salt, expectedKey.length);

  if (actualKey.length !== expectedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualKey, expectedKey);
};

export const assertStrongPassword = (password: string) => {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
};

export const createRefreshSession = async (user: { id: string; email: string }) => {
  const refreshToken = createRandomToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("auth_refresh_tokens").insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: expiresAt,
  });

  if (error && isMissingTableError(error)) {
    const exp = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
    const fallbackRefreshToken = issueFallbackToken(FALLBACK_REFRESH_PREFIX, {
      purpose: "refresh",
      sub: user.id,
      email: user.email,
      exp,
      jti: createRandomToken(),
    });

    return {
      token: issueAuthToken(user),
      refreshToken: fallbackRefreshToken,
      user,
    };
  }

  if (error) {
    throw error;
  }

  return {
    token: issueAuthToken(user),
    refreshToken,
    user,
  };
};

export const rotateRefreshSession = async (refreshTokenInput: string) => {
  if (String(refreshTokenInput || "").startsWith(FALLBACK_REFRESH_PREFIX)) {
    const payload = verifyFallbackToken<{ sub: string; email: string; exp: number; purpose: string }>(
      refreshTokenInput,
      FALLBACK_REFRESH_PREFIX,
      "refresh",
    );
    return createRefreshSession(buildAuthUser(payload.email));
  }

  const tokenHash = hashToken(refreshTokenInput);
  const now = new Date().toISOString();

  const { data: session, error } = await supabase
    .from("auth_refresh_tokens")
    .select("id,user_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .single();

  if (error && isMissingTableError(error)) {
    throw new Error("Invalid refresh token");
  }

  if (error || !session) {
    throw new Error("Invalid refresh token");
  }

  await supabase
    .from("auth_refresh_tokens")
    .update({ revoked_at: now })
    .eq("id", session.id);

  const email = normalizeEmail(emailFromUserId(session.user_id));
  const user = buildAuthUser(email);
  return createRefreshSession(user);
};

export const revokeRefreshToken = async (refreshTokenInput: string) => {
  if (!refreshTokenInput || String(refreshTokenInput).startsWith(FALLBACK_REFRESH_PREFIX)) {
    return;
  }

  await supabase
    .from("auth_refresh_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashToken(refreshTokenInput));
};

export const createPasswordResetToken = async (userId: string) => {
  const token = createRandomToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase.from("auth_password_reset_tokens").insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });

  if (error && isMissingTableError(error)) {
    const exp = Math.floor(Date.now() / 1000) + RESET_TOKEN_TTL_MINUTES * 60;
    return issueFallbackToken(FALLBACK_RESET_PREFIX, {
      purpose: "password-reset",
      sub: userId,
      exp,
      jti: createRandomToken(),
    });
  }

  if (error) {
    throw error;
  }

  return token;
};

export const consumePasswordResetToken = async (tokenInput: string) => {
  if (String(tokenInput || "").startsWith(FALLBACK_RESET_PREFIX)) {
    const payload = verifyFallbackToken<{ sub: string; exp: number; purpose: string }>(
      tokenInput,
      FALLBACK_RESET_PREFIX,
      "password-reset",
    );
    return payload.sub;
  }

  const now = new Date().toISOString();
  const { data: resetToken, error } = await supabase
    .from("auth_password_reset_tokens")
    .select("id,user_id,expires_at,used_at")
    .eq("token_hash", hashToken(tokenInput))
    .is("used_at", null)
    .gt("expires_at", now)
    .single();

  if (error || !resetToken) {
    throw new Error("Invalid or expired reset token");
  }

  await supabase
    .from("auth_password_reset_tokens")
    .update({ used_at: now })
    .eq("id", resetToken.id);

  return String(resetToken.user_id);
};
