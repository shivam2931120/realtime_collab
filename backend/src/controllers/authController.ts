import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { buildAuthUser, issueAuthToken } from "../utils/authToken";
import { supabase } from "../config/supabase";
import { isMissingTableError } from "../utils/dbErrors";
import { sendPasswordResetEmail } from "../utils/mailer";
import {
  assertStrongPassword,
  consumePasswordResetToken,
  createPasswordResetToken,
  createFallbackAuthUser,
  createRefreshSession,
  findFallbackAuthUserByEmail,
  hashPassword,
  revokeRefreshToken,
  rotateRefreshSession,
  updateFallbackAuthPassword,
  verifyPassword,
} from "../utils/passwordAuth";
import { normalizeEmail } from "../utils/userIdentity";

const sanitizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const sanitizePassword = (value: unknown) => String(value || "");

const getResetBaseUrl = () =>
  String(process.env.CLIENT_URL || "http://localhost:5173").trim().replace(/\/+$/, "");

const authTablesMissingResponse = (res: Response) =>
  res.status(503).json({
    message: "Password auth tables are not initialized. Run the latest supabase_schema.sql migration.",
  });

const sessionPayload = async (user: { id: string; email: string }) => {
  const session = await createRefreshSession(user);
  return {
    ...session,
    expiresInSeconds: Math.max(60, Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 14)),
  };
};

export const createSession = async (req: Request, res: Response) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const user = buildAuthUser(email);
    const token = issueAuthToken(user);

    return res.json({
      token,
      user,
      expiresInSeconds: Math.max(60, Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 14)),
    });
  } catch {
    return res.status(400).json({ message: "Valid email required" });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const password = sanitizePassword(req.body?.password);
    assertStrongPassword(password);

    const user = buildAuthUser(email);

    const { data: existingUser, error: lookupError } = await supabase
      .from("auth_users")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();

    if (lookupError && isMissingTableError(lookupError)) {
      const existingFallbackUser = await findFallbackAuthUserByEmail(user.email);
      if (existingFallbackUser) {
        return res.status(409).json({ message: "Account already exists. Sign in instead." });
      }

      await createFallbackAuthUser(user, hashPassword(password));
      return res.status(201).json(await sessionPayload(user));
    }

    if (lookupError) {
      throw lookupError;
    }

    if (existingUser) {
      return res.status(409).json({ message: "Account already exists. Sign in instead." });
    }

    const { error } = await supabase.from("auth_users").insert({
      id: user.id,
      email: user.email,
      password_hash: hashPassword(password),
    });

    if (error) {
      throw error;
    }

    return res.status(201).json(await sessionPayload(user));
  } catch (error: any) {
    if (isMissingTableError(error)) {
      return authTablesMissingResponse(res);
    }

    return res.status(400).json({ message: error?.message || "Registration failed" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = sanitizePassword(req.body?.password);

    const { data: userRow, error } = await supabase
      .from("auth_users")
      .select("id,email,password_hash")
      .eq("email", email)
      .single();

    if (error && isMissingTableError(error)) {
      const fallbackUser = await findFallbackAuthUserByEmail(email);
      if (!fallbackUser || !verifyPassword(password, fallbackUser.password_hash)) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = buildAuthUser(fallbackUser.email);
      return res.json(await sessionPayload(user));
    }

    if (error || !userRow || !verifyPassword(password, userRow.password_hash)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = buildAuthUser(userRow.email);
    return res.json(await sessionPayload(user));
  } catch (error) {
    if (isMissingTableError(error)) {
      return authTablesMissingResponse(res);
    }

    return res.status(500).json({ message: "Login failed" });
  }
};

export const refreshSession = async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "");
    const session = await rotateRefreshSession(refreshToken);

    return res.json({
      ...session,
      expiresInSeconds: Math.max(60, Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 14)),
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return authTablesMissingResponse(res);
    }

    return res.status(401).json({ message: "Refresh token invalid or expired" });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    await revokeRefreshToken(String(req.body?.refreshToken || ""));
    return res.json({ success: true });
  } catch {
    return res.json({ success: true });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);

    const { data: userRow, error } = await supabase
      .from("auth_users")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (error && isMissingTableError(error)) {
      const fallbackUser = await findFallbackAuthUserByEmail(email);
      if (fallbackUser) {
        const resetToken = await createPasswordResetToken(fallbackUser.id);
        const resetUrl = `${getResetBaseUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`;
        await sendPasswordResetEmail({ to: fallbackUser.email, resetUrl }).catch((mailError) =>
          console.error("Password reset email failed", mailError),
        );
      }

      return res.json({ message: "If an account exists, password reset instructions have been sent." });
    }

    if (error) {
      throw error;
    }

    if (userRow) {
      const resetToken = await createPasswordResetToken(userRow.id);
      const resetUrl = `${getResetBaseUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`;
      await sendPasswordResetEmail({ to: userRow.email, resetUrl }).catch((mailError) =>
        console.error("Password reset email failed", mailError),
      );
    }

    return res.json({ message: "If an account exists, password reset instructions have been sent." });
  } catch (error) {
    if (isMissingTableError(error)) {
      return authTablesMissingResponse(res);
    }

    return res.status(500).json({ message: "Password reset request failed" });
  }
};

export const confirmPasswordReset = async (req: Request, res: Response) => {
  try {
    const resetToken = String(req.body?.token || "");
    const password = sanitizePassword(req.body?.password);
    assertStrongPassword(password);

    const userId = await consumePasswordResetToken(resetToken);
    const { error } = await supabase
      .from("auth_users")
      .update({ password_hash: hashPassword(password), updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error && isMissingTableError(error)) {
      await updateFallbackAuthPassword(userId, hashPassword(password));
      return res.json({ success: true });
    }

    if (error) {
      throw error;
    }

    await supabase
      .from("auth_refresh_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);

    return res.json({ success: true });
  } catch (error: any) {
    if (isMissingTableError(error)) {
      return authTablesMissingResponse(res);
    }

    return res.status(400).json({ message: error?.message || "Password reset failed" });
  }
};

export const getSession = async (req: AuthRequest, res: Response) => {
  if (!req.auth?.userId || !req.auth?.email) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return res.json({
    user: {
      id: req.auth.userId,
      email: req.auth.email,
    },
  });
};
