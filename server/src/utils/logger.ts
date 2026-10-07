export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  requestId?: string;
  userId?: string;
  method?: string;
  route?: string;
  statusCode?: number;
  responseTimeMs?: number;
  errorCode?: string;
  [key: string]: any;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'refreshtoken',
  'secret',
  'jwt_secret',
  'authorization',
  'cookie',
  'resettoken',
]);

function sanitize(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = sanitize(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

class Logger {
  private format(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const cleanContext = context ? sanitize(context) : {};

    const metaParts = [];
    if (cleanContext.requestId) metaParts.push(`[${cleanContext.requestId}]`);
    if (cleanContext.method && cleanContext.route) {
      metaParts.push(`[${cleanContext.method} ${cleanContext.route}]`);
    }
    if (cleanContext.statusCode) metaParts.push(`[${cleanContext.statusCode}]`);
    if (cleanContext.responseTimeMs !== undefined) metaParts.push(`[${cleanContext.responseTimeMs}ms]`);
    if (cleanContext.userId) metaParts.push(`[usr:${cleanContext.userId}]`);
    if (cleanContext.errorCode) metaParts.push(`[${cleanContext.errorCode}]`);

    const metaString = metaParts.length > 0 ? `${metaParts.join(' ')} ` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${metaString}${message}`;
  }

  info(message: string, context?: LogContext) {
    console.log(this.format('info', message, context));
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.format('warn', message, context));
  }

  error(message: string, errorOrContext?: any, maybeContext?: LogContext) {
    let context: LogContext = {};
    let errMessage = message;

    if (errorOrContext instanceof Error) {
      errMessage = `${message}: ${errorOrContext.message}`;
      context = maybeContext || {};
    } else if (errorOrContext && typeof errorOrContext === 'object') {
      context = errorOrContext;
    }

    console.error(this.format('error', errMessage, context));
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.format('debug', message, context));
    }
  }
}

export const logger = new Logger();
