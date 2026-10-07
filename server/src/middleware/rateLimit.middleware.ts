import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/errors';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStores: Map<string, Map<string, RateLimitRecord>> = new Map();

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}) {
  const { windowMs, maxRequests, keyPrefix = 'global' } = options;

  if (!rateLimitStores.has(keyPrefix)) {
    rateLimitStores.set(keyPrefix, new Map());
  }
  const store = rateLimitStores.get(keyPrefix)!;

  // Periodic cleanup of expired entries
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (record.resetAt <= now) {
        store.delete(key);
      }
    }
  }, windowMs).unref();

  return (req: Request, _res: Response, next: NextFunction) => {
    const clientKey = (req.ip || req.socket.remoteAddress || 'unknown') + (req.headers['authorization'] || '');
    const now = Date.now();

    let record = store.get(clientKey);
    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + windowMs };
      store.set(clientKey, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      return next(new RateLimitError(`Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.round(windowMs / 1000)} seconds.`));
    }

    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'auth',
});

export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'pwd_reset',
});
