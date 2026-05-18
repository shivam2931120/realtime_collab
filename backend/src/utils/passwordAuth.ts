import crypto from "crypto";
import { supabase } from "../config/supabase";
import { buildAuthUser, issueAuthToken } from "./authToken";
import { emailFromUserId, normalizeEmail } from "./userIdentity";

const SCRYPT_KEY_LENGTH = 64;
const REFRESH_TOKEN_TTL_DAYS = 30;
const RESET_TOKEN_TTL_MINUTES = 30;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const createRandomToken = () => crypto.randomBytes(48).toString("base64url");

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
  const tokenHash = hashToken(refreshTokenInput);
  const now = new Date().toISOString();

  const { data: session, error } = await supabase
    .from("auth_refresh_tokens")
    .select("id,user_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .single();

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
  if (!refreshTokenInput) {
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

  if (error) {
    throw error;
  }

  return token;
};

export const consumePasswordResetToken = async (tokenInput: string) => {
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
