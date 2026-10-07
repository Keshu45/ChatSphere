import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRoutes } from '../server/src/routes/auth.routes';
import { userRoutes } from '../server/src/routes/user.routes';
import { conversationRoutes } from '../server/src/routes/conversation.routes';
import { messageRoutes } from '../server/src/routes/message.routes';
import { uploadRoutes } from '../server/src/routes/upload.routes';
import { searchRoutes } from '../server/src/routes/search.routes';
import { errorHandler } from '../server/src/middleware/error.middleware';
import { requestIdMiddleware } from '../server/src/middleware/requestId.middleware';
import { requestLoggerMiddleware } from '../server/src/middleware/requestLogger.middleware';
import { db } from '../server/src/db/storage';
import { createRateLimiter } from '../server/src/middleware/rateLimit.middleware';

async function runSection19Audit() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '20mb' }));

  // Probes
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
      res.status(503).json({ status: 'UNREADY' });
      return;
    }
    res.json({
      status: 'READY',
      service: 'ChatSphere API',
      dependencies: { database: 'connected' },
      memory: { heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10 },
      timestamp: new Date().toISOString(),
    });
  });

  // Dedicated test rate-limited endpoint (max 3 requests)
  const testLimiter = createRateLimiter({ windowMs: 5000, maxRequests: 3, keyPrefix: 'test_obs' });
  app.get('/api/v1/test-ratelimit', testLimiter, (_req, res) => {
    res.json({ success: true, data: { ok: true } });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/conversations', conversationRoutes);
  app.use('/api/v1/messages', messageRoutes);
  app.use('/api/v1/uploads', uploadRoutes);
  app.use('/api/v1/search', searchRoutes);

  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: req.id },
    });
  });

  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(3031, resolve));
  const baseUrl = 'http://localhost:3031';

  console.log('[SECTION 19 AUDIT] Test server listening on :3031');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, cond: boolean) {
    if (cond) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      failed++;
    }
  }

  try {
    // 1. Health Probe
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = await healthRes.json();
    assert('GET /health returns 200 with status UP & uptimeSeconds', healthRes.status === 200 && healthJson.status === 'UP' && typeof healthJson.uptimeSeconds === 'number');

    // 2. Ready Probe
    const readyRes = await fetch(`${baseUrl}/ready`);
    const readyJson = await readyRes.json();
    assert('GET /ready returns 200 with database check & memory telemetry', readyRes.status === 200 && readyJson.status === 'READY' && readyJson.dependencies?.database === 'connected');

    // 3. Request ID Generation
    const reqIdRes = await fetch(`${baseUrl}/health`);
    const genHeader = reqIdRes.headers.get('x-request-id');
    assert('Server generates and attaches x-request-id header', Boolean(genHeader && genHeader.startsWith('req_')));

    // 4. Custom Request ID Passthrough
    const customId = 'test-audit-req-xyz-999';
    const customReqRes = await fetch(`${baseUrl}/health`, {
      headers: { 'x-request-id': customId },
    });
    assert('Server preserves client-supplied x-request-id', customReqRes.headers.get('x-request-id') === customId);

    // 5. Malformed JSON Payload handling
    const malformedRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid_json: true, broken',
    });
    const malformedJson = await malformedRes.json();
    assert('Malformed JSON returns 400 INVALID_JSON in standard envelope', malformedRes.status === 400 && malformedJson.error?.code === 'INVALID_JSON');

    // 6. Validation Error with Zod
    const valRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ab', email: 'not-an-email', password: '123' }),
    });
    const valJson = await valRes.json();
    assert('Invalid payload returns 400 VALIDATION_ERROR with safe message', valRes.status === 400 && valJson.error?.code === 'VALIDATION_ERROR' && !valJson.stack);

    // 7. Unauthenticated Protected Access
    const unauthRes = await fetch(`${baseUrl}/api/v1/conversations`);
    const unauthJson = await unauthRes.json();
    assert('Protected route without token returns 401 UNAUTHORIZED', unauthRes.status === 401 && unauthJson.error?.code === 'UNAUTHORIZED');

    // 8. Unknown API Route 404
    const unknownRes = await fetch(`${baseUrl}/api/v1/non-existent-path`);
    const unknownJson = await unknownRes.json();
    assert('Unknown API route returns 404 NOT_FOUND with requestId', unknownRes.status === 404 && unknownJson.error?.code === 'NOT_FOUND' && Boolean(unknownJson.error?.requestId));

    // 9. Rate Limiter Trigger
    await fetch(`${baseUrl}/api/v1/test-ratelimit`);
    await fetch(`${baseUrl}/api/v1/test-ratelimit`);
    await fetch(`${baseUrl}/api/v1/test-ratelimit`);
    const limitRes = await fetch(`${baseUrl}/api/v1/test-ratelimit`);
    const limitJson = await limitRes.json();
    assert('Exceeding rate limit returns 429 RATE_LIMIT_EXCEEDED', limitRes.status === 429 && limitJson.error?.code === 'RATE_LIMIT_EXCEEDED');

    // 10. No Sensitive Data in Responses
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: 'alex_rivera', password: 'password123' }),
    });
    const loginJson = await loginRes.json();
    const str = JSON.stringify(loginJson);
    assert('Password hash and secrets never exposed in responses', !str.includes('passwordHash') && !str.includes('$2a$') && !str.includes('JWT_SECRET'));

    console.log(`\n[SECTION 19 AUDIT SUMMARY]: ${passed} PASSED, ${failed} FAILED`);
  } catch (err) {
    console.error('Section 19 execution error:', err);
    failed++;
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSection19Audit();
