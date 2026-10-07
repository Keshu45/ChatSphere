import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = req.id || (req.headers['x-request-id'] as string) || 'unknown';

  res.on('finish', () => {
    const responseTimeMs = Date.now() - startTime;
    const userId = (req as any).user?.userId;

    const context = {
      requestId,
      method: req.method,
      route: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTimeMs,
      userId,
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', context);
    } else {
      logger.info('Request completed', context);
    }
  });

  next();
}
