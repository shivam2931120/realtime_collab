import { ClerkExpressRequireAuth, StrictAuthProp } from '@clerk/clerk-sdk-node';
import { Request, Response, NextFunction } from 'express';

// Extend the Express Request type globally so TS is happy
declare global {
  namespace Express {
    interface Request extends StrictAuthProp {}
  }
}

// AuthRequest is used by all controllers — export it so they can import it
export type AuthRequest = Request & StrictAuthProp;

const authDisabled = process.env.DISABLE_AUTH === 'true';
const demoUserId = process.env.DEMO_USER_ID || 'demo-user';

const demoAuth: StrictAuthProp['auth'] = {
  sessionId: 'demo-session',
  userId: demoUserId,
  actor: null,
  getToken: async () => null,
  debug: () => {},
  claims: {},
};

export const protect = authDisabled
  ? async (req: Request, _res: Response, next: NextFunction) => {
      (req as AuthRequest).auth = demoAuth;
      next();
    }
  : ClerkExpressRequireAuth({});

export const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.message === 'Unauthenticated') {
    return res.status(401).json({ message: 'Unauthenticated Request' });
  }
  next(err);
};
