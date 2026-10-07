import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { AuthenticationError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function authMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return next(new AuthenticationError('Authentication required. No authorization token provided.'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new AuthenticationError('Invalid or expired authorization token.'));
    }

    req.user = payload;
    next();
  } catch (err: any) {
    next(new AuthenticationError('Authentication failed.'));
  }
}
