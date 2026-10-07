import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.id || (req.headers['x-request-id'] as string) || 'unknown';
  const userId = (req as any).user?.userId;

  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected server error occurred. Please try again later.';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Malformed JSON payload provided';
  } else if (err.message && (err.message.includes('Forbidden') || err.message.includes('permission'))) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = err.message;
  } else if (err.message && err.message.includes('not found')) {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = err.message;
  } else if (err.message && (err.message.includes('required') || err.message.includes('Invalid'))) {
    statusCode = 400;
    errorCode = 'BAD_REQUEST';
    message = err.message;
  }

  // Structured log without leaking credentials, secrets, or internal stacks
  const logData = {
    requestId,
    method: req.method,
    route: req.originalUrl || req.url,
    statusCode,
    errorCode,
    userId,
  };

  if (statusCode >= 500) {
    logger.error(err.message || 'Server error', logData);
  } else {
    logger.info(err.message || 'Client error', logData);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      requestId,
    },
  });
}
