import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { authRoutes } from '../server/src/routes/auth.routes';
import { userRoutes } from '../server/src/routes/user.routes';
import { conversationRoutes } from '../server/src/routes/conversation.routes';
import { messageRoutes } from '../server/src/routes/message.routes';
import { uploadRoutes } from '../server/src/routes/upload.routes';
import { searchRoutes } from '../server/src/routes/search.routes';
import { errorHandler } from '../server/src/middleware/error.middleware';
import { requestIdMiddleware } from '../server/src/middleware/requestId.middleware';
import { createRateLimiter } from '../server/src/middleware/rateLimit.middleware';

describe('20.3 Security Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let tokenUserA: string;
  let userAId: string;

  let tokenUserB: string;
  let userBId: string;

  let tokenUserC: string;
  let userCId: string;

  let convABId: string;
  let groupConvId: string;
  let messageAId: string;

  before(async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());
    app.use(express.json({ limit: '20mb' }));

    // Test limiter for security rate-limit verification
    const securityTestLimiter = createRateLimiter({
      windowMs: 5000,
      maxRequests: 2,
      keyPrefix: 'sec_test',
    });
    app.get('/api/v1/sec-ratelimit-probe', securityTestLimiter, (_req, res) => {
      res.json({ success: true, data: { status: 'ok' } });
    });

    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/users', userRoutes);
    app.use('/api/v1/conversations', conversationRoutes);
    app.use('/api/v1/messages', messageRoutes);
    app.use('/api/v1/uploads', uploadRoutes);
    app.use('/api/v1/search', searchRoutes);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(3033, resolve));
    baseUrl = 'http://localhost:3033';

    // Register 3 distinct users: User A, User B, User C
    const regA = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `sec_a_${Date.now()}`,
        email: `sec_a_${Date.now()}@example.com`,
        password: 'StrongPass123!',
      }),
    }).then(r => r.json());
    tokenUserA = regA.data.token;
    userAId = regA.data.user.id;

    const regB = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `sec_b_${Date.now()}`,
        email: `sec_b_${Date.now()}@example.com`,
        password: 'StrongPass123!',
      }),
    });
    const bJson = await regB.json();
    tokenUserB = bJson.data.token;
    userBId = bJson.data.user.id;

    const regC = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `sec_c_${Date.now()}`,
        email: `sec_c_${Date.now()}@example.com`,
        password: 'StrongPass123!',
      }),
    });
    const cJson = await regC.json();
    tokenUserC = cJson.data.token;
    userCId = cJson.data.user.id;

    // Create private DM between A and B
    const convRes = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({ type: 'direct', targetUserId: userBId }),
    }).then(r => r.json());
    convABId = convRes.data.conversation.id;

    // Create Group by User A with User B
    const grpRes = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        type: 'group',
        name: 'Secured Channel',
        memberIds: [userBId],
      }),
    }).then(r => r.json());
    groupConvId = grpRes.data.conversation.id;

    // User A posts message
    const msgRes = await fetch(`${baseUrl}/api/v1/conversations/${convABId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({ text: 'Secret message from A' }),
    }).then(r => r.json());
    messageAId = msgRes.data.message.id;
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('1. Broken Access Control: User C cannot access User A & B private conversation', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${convABId}`, {
      headers: { Authorization: `Bearer ${tokenUserC}` },
    });
    const json = await res.json();
    assert.equal(res.status, 403);
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  it('2. Sender Impersonation Prevention: server ignores client-supplied senderId', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${convABId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserB}`,
      },
      body: JSON.stringify({
        text: 'Spoofed message attempt',
        senderId: userAId, // Attempting to impersonate user A
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 201);
    // Server MUST use authenticated user identity from token (User B), not the body
    assert.equal(json.data.message.senderId, userBId);
    assert.notEqual(json.data.message.senderId, userAId);
  });

  it('3. Message Integrity: User B cannot edit User A message', async () => {
    const res = await fetch(`${baseUrl}/api/v1/messages/${messageAId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserB}`,
      },
      body: JSON.stringify({ text: 'Malicious edit by B' }),
    });
    const json = await res.json();
    assert.equal(res.status, 403);
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  it('4. Message Deletion Authorization: User B cannot delete User A message in DM', async () => {
    const res = await fetch(`${baseUrl}/api/v1/messages/${messageAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    const json = await res.json();
    assert.equal(res.status, 403);
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  it('5. Private Room Protection: Non-members cannot retrieve messages of private chat', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${convABId}/messages`, {
      headers: { Authorization: `Bearer ${tokenUserC}` },
    });
    const json = await res.json();
    assert.equal(res.status, 403);
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  it('6. Group Member Revocation: Removed members cannot send messages', async () => {
    // Admin (A) removes B from group
    const remRes = await fetch(`${baseUrl}/api/v1/conversations/${groupConvId}/members/${userBId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    assert.equal(remRes.status, 200);

    // B attempts to send message to group
    const sendRes = await fetch(`${baseUrl}/api/v1/conversations/${groupConvId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserB}`,
      },
      body: JSON.stringify({ text: 'Attempting to send after removal' }),
    });
    const sendJson = await sendRes.json();
    assert.equal(sendRes.status, 403);
    assert.equal(sendJson.success, false);
    assert.equal(sendJson.error.code, 'FORBIDDEN');
  });

  it('7. Role-Based Access Control: Non-admins cannot perform admin operations', async () => {
    // Re-add B to group as member
    await fetch(`${baseUrl}/api/v1/conversations/${groupConvId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({ memberIds: [userBId] }),
    });

    // Non-admin B attempts to update group info
    const updateRes = await fetch(`${baseUrl}/api/v1/conversations/${groupConvId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserB}`,
      },
      body: JSON.stringify({ name: 'Hacked Title' }),
    });
    const updateJson = await updateRes.json();
    assert.equal(updateRes.status, 403);
    assert.equal(updateJson.error.code, 'FORBIDDEN');
  });

  it('8. Tampered Session Rejection: forged JWT signature is rejected', async () => {
    const forgedToken = tokenUserA + 'tampered';
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    const json = await res.json();
    assert.equal(res.status, 401);
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });

  it('9. Expired Session Rejection: expired tokens are rejected', async () => {
    const secret = process.env.JWT_SECRET || 'chatsphere-super-secure-production-jwt-secret-2026';
    const expiredToken = jwt.sign(
      { userId: userAId, username: 'sec_a', email: 'sec_a@example.com' },
      secret,
      { expiresIn: '-10s' }
    );

    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const json = await res.json();
    assert.equal(res.status, 401);
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });

  it('10. Rate Limiting Protection: blocks excessive requests with 429', async () => {
    await fetch(`${baseUrl}/api/v1/sec-ratelimit-probe`);
    await fetch(`${baseUrl}/api/v1/sec-ratelimit-probe`);
    const blockedRes = await fetch(`${baseUrl}/api/v1/sec-ratelimit-probe`);
    const json = await blockedRes.json();
    assert.equal(blockedRes.status, 429);
    assert.equal(json.error.code, 'RATE_LIMIT_EXCEEDED');
  });

  it('11. Payload Validation: invalid request bodies are strictly rejected', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'invalid user with spaces!',
        email: 'invalid-email',
        password: '1',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });

  it('12. Oversized Payload Protection: messages over 5000 characters are rejected', async () => {
    const hugeText = 'A'.repeat(5001);
    const res = await fetch(`${baseUrl}/api/v1/conversations/${convABId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({ text: hugeText }),
    });
    const json = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });
});
