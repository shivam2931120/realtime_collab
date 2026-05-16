import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { buildAuthUser, issueAuthToken } from "../utils/authToken";

const sanitizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

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
