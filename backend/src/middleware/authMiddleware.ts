import { Request, Response, NextFunction } from "express";
import { verifyAuthToken } from "../utils/authToken";
import { emailFromUserId } from "../utils/userIdentity";

type AppAuth = {
  sessionId: string;
  userId: string;
  email: string;
  getToken: () => Promise<string | null>;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AppAuth;
    }
  }
}

export type AuthRequest = Request & { auth?: AppAuth };

const authDisabled = process.env.DISABLE_AUTH === "true";
const demoUserId = process.env.DEMO_USER_ID || "usr_ZGVtb0BleGFtcGxlLmNvbQ";
const demoEmail = process.env.DEMO_USER_EMAIL || emailFromUserId(demoUserId);

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  if (authDisabled) {
    (req as AuthRequest).auth = {
      sessionId: "demo-session",
      userId: demoUserId,
      email: demoEmail,
      getToken: async () => null,
    };
    next();
    return;
  }

  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ message: "Unauthenticated Request" });
  }

  try {
    const token = match[1];
    const user = verifyAuthToken(token);
    (req as AuthRequest).auth = {
      sessionId: `sess_${user.id}`,
      userId: user.id,
      email: user.email,
      getToken: async () => token,
    };
    next();
  } catch {
    return res.status(401).json({ message: "Unauthenticated Request" });
  }
};
