import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.headers['x-request-id'] as string;
  const requestId = incomingId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
