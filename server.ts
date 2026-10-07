import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { setupSocketServer } from './server/src/sockets/socket.server';
import { authRoutes } from './server/src/routes/auth.routes';
import { userRoutes } from './server/src/routes/user.routes';
import { conversationRoutes } from './server/src/routes/conversation.routes';
import { messageRoutes } from './server/src/routes/message.routes';
import { uploadRoutes } from './server/src/routes/upload.routes';
import { searchRoutes } from './server/src/routes/search.routes';
import { errorHandler } from './server/src/middleware/error.middleware';
import { requestIdMiddleware } from './server/src/middleware/requestId.middleware';
import { requestLoggerMiddleware } from './server/src/middleware/requestLogger.middleware';
import { logger } from './server/src/utils/logger';
import { db } from './server/src/db/storage';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProd = process.env.NODE_ENV === 'production';
const clientUrl = process.env.CLIENT_URL;
const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'chatsphere-cookie-secret';

async function bootstrap() {
  await db.connect();

  const app = express();
  const httpServer = http.createServer(app);

  // Initialize Socket.io real-time engine
  const io = setupSocketServer(httpServer);
  app.set('io', io);

  // Observability & Request Correlation Middleware
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // Security Headers Middleware (OWASP Defense in Depth)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.removeHeader('X-Powered-By');
    next();
  });

  // CORS Configuration
  app.use(cors({
    origin: isProd && clientUrl ? [clientUrl] : (clientUrl ? [clientUrl, 'http://localhost:3000', 'http://localhost:5173'] : true),
    credentials: true,
  }));
  app.use(cookieParser(sessionSecret));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Observability & Health Probes (Section 19)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'UP',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', (_req, res) => {
    const isDbReady = Boolean(db && db.users && db.users.length > 0);
    const mem = process.memoryUsage();

    if (!isDbReady) {
      res.status(503).json({
        status: 'UNREADY',
        reason: 'Database storage not initialized or empty',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      status: 'READY',
      service: 'ChatSphere API Engine',
      dependencies: {
        database: db.isMongoConnected ? 'mongodb-connected' : 'local-json',
        redis: process.env.REDIS_URL ? 'redis-configured' : 'in-memory-active',
        sockets: 'operational',
      },
      memory: {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // REST API Endpoints under /api/v1
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/conversations', conversationRoutes);
  app.use('/api/v1/messages', messageRoutes);
  app.use('/api/v1/uploads', uploadRoutes);
  app.use('/api/v1/search', searchRoutes);

  // Unknown API route fallback
  app.all('/api/*', (req, res) => {
    const requestId = req.id || 'unknown';
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint '${req.method} ${req.originalUrl}' not found`,
        requestId,
      },
    });
  });

  // Centralized Error Handling
  app.use(errorHandler);

  // Frontend Integration: Vite Middleware (Dev) vs Static Files (Prod)
   if (!isProd) {
  const { createServer: createViteServer } = await import('vite');

  const vite = await createViteServer({
    server: {
      middlewareMode: true,

      // Disable HMR to prevent repeated page reloads
      hmr: false,

      // Disable Vite file watching in the Express-integrated server
      watch: null,
    },

    appType: 'spa',
  });

  app.use(vite.middlewares);
}else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`ChatSphere full-stack engine running on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handling
  let isShuttingDown = false;
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}, initiating graceful shutdown...`);

    // Notify connected sockets
    io.emit('server:shutdown', { message: 'Server is undergoing scheduled restart' });

    httpServer.close(() => {
      logger.info('HTTP server closed, all connections drained');
      void db.close().then(() => {
        process.exit(0);
      }).catch(error => {
        logger.error('Failed to close database connection cleanly', error);
        process.exit(1);
      });
    });

    // Force exit if hanging
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', err);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason });
  });
}

bootstrap().catch(err => {
  console.error('[ChatSphere] Fatal startup error:', err);
  process.exit(1);
});
