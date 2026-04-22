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

export const protect = ClerkExpressRequireAuth({});

export const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.message === 'Unauthenticated') {
    return res.status(401).json({ message: 'Unauthenticated Request' });
  }
  next(err);
};
