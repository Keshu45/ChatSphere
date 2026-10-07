import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
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

describe('20.2 API Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let tokenUserA: string;
  let userAId: string;
  let usernameA: string;

  let tokenUserB: string;
  let userBId: string;
  let usernameB: string;

  let directConvId: string;
  let groupConvId: string;
  let createdMessageId: string;

  before(async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());
    app.use(express.json({ limit: '20mb' }));

    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/users', userRoutes);
    app.use('/api/v1/conversations', conversationRoutes);
    app.use('/api/v1/messages', messageRoutes);
    app.use('/api/v1/uploads', uploadRoutes);
    app.use('/api/v1/search', searchRoutes);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(3032, resolve));
    baseUrl = 'http://localhost:3032';
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  // 1. Registration
  it('1. Registration: creates User A successfully', async () => {
    usernameA = `int_user_a_${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: usernameA,
        email: `${usernameA}@example.com`,
        password: 'StrongPass123!',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.success, true);
    assert.equal(json.data.user.username, usernameA);
    assert.ok(json.data.token);
    tokenUserA = json.data.token;
    userAId = json.data.user.id;
  });

  // 2. Duplicate Registration
  it('2. Duplicate Registration: rejects duplicate email or username', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: usernameA,
        email: `${usernameA}@example.com`,
        password: 'StrongPass123!',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });

  // 3. Login
  it('3. Login: authenticates User A and returns session token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrUsername: usernameA,
        password: 'StrongPass123!',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.ok(json.data.token);
    tokenUserA = json.data.token;
  });

  // 4. Invalid Login
  it('4. Invalid Login: rejects incorrect credentials with 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrUsername: usernameA,
        password: 'incorrectPassword',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 401);
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });

  // 5. Logout
  it('5. Logout: logs out cleanly and clears auth cookie', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, { method: 'POST' });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
  });

  // 6. Protected API Access
  it('6. Protected API Access: enforces authorization header requirement', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`);
    const json = await res.json();
    assert.equal(res.status, 401);
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'UNAUTHORIZED');

    const authRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    const authJson = await authRes.json();
    assert.equal(authRes.status, 200);
    assert.equal(authJson.data.user.id, userAId);
  });

  // Setup User B for conversation & security tests
  it('Setup: creates User B for multi-user integration testing', async () => {
    usernameB = `int_user_b_${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: usernameB,
        email: `${usernameB}@example.com`,
        password: 'StrongPass123!',
      }),
    });
    const json = await res.json();
    tokenUserB = json.data.token;
    userBId = json.data.user.id;
    assert.ok(tokenUserB);
  });

  // 7. User Search
  it('7. User Search: finds registered users by query excluding self', async () => {
    const res = await fetch(`${baseUrl}/api/v1/search/users?q=${usernameB}`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.ok(json.data.users.some((u: any) => u.id === userBId));
    assert.ok(!json.data.users.some((u: any) => u.id === userAId));
  });

  // 8. Direct Conversation Creation
  it('8. Direct Conversation Creation: starts a 1-on-1 chat between User A and User B', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        type: 'direct',
        targetUserId: userBId,
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.data.conversation.type, 'direct');
    directConvId = json.data.conversation.id;
    assert.ok(directConvId);
  });

  // 9. Duplicate Direct Conversation Prevention
  it('9. Duplicate Direct Conversation Prevention: reuses existing conversation ID', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserB}`,
      },
      body: JSON.stringify({
        type: 'direct',
        targetUserId: userAId,
      }),
    });
    const json = await res.json();
    assert.equal(json.data.conversation.id, directConvId);
  });

  // 10. Group Creation
  it('10. Group Creation: creates a group conversation with members and admin role', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        type: 'group',
        name: 'Sprint 20 Core',
        description: 'Integration test channel',
        memberIds: [userBId],
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.data.conversation.type, 'group');
    assert.equal(json.data.conversation.name, 'Sprint 20 Core');
    groupConvId = json.data.conversation.id;

    const adminMember = json.data.conversation.members.find((m: any) => m.userId === userAId);
    assert.equal(adminMember.role, 'admin');
  });

  // 11. Add Member
  it('11. Add Member: allows admin to add a new member to group', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${groupConvId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({ memberIds: ['usr_elena'] }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(json.data.conversation.members.some((m: any) => m.userId === 'usr_elena'));
  });

  // 12. Remove Member
  it('12. Remove Member: allows admin to remove a member from group', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${groupConvId}/members/usr_elena`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(!json.data.conversation.members.some((m: any) => m.userId === 'usr_elena'));
  });

  // 13. Unauthorized Conversation Access
  it('13. Unauthorized Conversation Access: blocks non-members with 403 FORBIDDEN', async () => {
    // usr_alex and usr_sam private conversation
    const res = await fetch(`${baseUrl}/api/v1/conversations/conv_alex_sam`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    const json = await res.json();
    assert.equal(res.status, 403);
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  // 14. Send Message
  it('14. Send Message: persists message in database and updates conversation preview', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${directConvId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        text: 'Integration message from User A to User B',
        type: 'text',
      }),
    });
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.data.message.text, 'Integration message from User A to User B');
    assert.equal(json.data.message.senderId, userAId);
    createdMessageId = json.data.message.id;
  });

  // 15. Retrieve Messages
  it('15. Retrieve Messages: fetches message history for authorized member', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${directConvId}/messages`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(json.data.messages.some((m: any) => m.id === createdMessageId));
  });

  // 16. Edit Message
  it('16. Edit Message: allows sender to update message content and marks editedAt', async () => {
    const res = await fetch(`${baseUrl}/api/v1/messages/${createdMessageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({ text: 'Edited integration message text' }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.message.text, 'Edited integration message text');
    assert.ok(json.data.message.editedAt);
  });

  // 17. Delete Message
  it('17. Delete Message: soft-deletes message with timestamp and placeholder', async () => {
    const res = await fetch(`${baseUrl}/api/v1/messages/${createdMessageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.message.text, 'This message was deleted');
    assert.ok(json.data.message.deletedAt);
  });

  // 18. Pagination
  it('18. Pagination: supports cursor and limit parameters', async () => {
    const res = await fetch(`${baseUrl}/api/v1/conversations/${directConvId}/messages?limit=5`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(json.data.messages));
    assert.ok(json.data.messages.length <= 5);
  });

  // 19. Search
  it('19. Search: searches messages within conversation', async () => {
    // Post searchable message
    await fetch(`${baseUrl}/api/v1/conversations/${directConvId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({ text: 'QuantumCryptographicProtocol v9' }),
    });

    const res = await fetch(
      `${baseUrl}/api/v1/search/messages?conversationId=${directConvId}&q=QuantumCryptographic`,
      { headers: { Authorization: `Bearer ${tokenUserA}` } }
    );
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(json.data.messages.some((m: any) => m.text.includes('QuantumCryptographicProtocol')));
  });

  // 20. Upload Validation
  it('20. Upload Validation: validates MIME types and rejects unsupported formats', async () => {
    // Unsupported executable upload attempt
    const badRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        originalName: 'exploit.exe',
        mimeType: 'application/x-msdownload',
        size: 1024,
        base64Data: 'data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQA=',
      }),
    });
    const badJson = await badRes.json();
    assert.equal(badRes.status, 400);
    assert.equal(badJson.success, false);

    // Valid PNG upload
    const goodRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        originalName: 'valid_diagram.png',
        mimeType: 'image/png',
        size: 512,
        base64Data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }),
    });
    const goodJson = await goodRes.json();
    assert.equal(goodRes.status, 201);
    assert.equal(goodJson.success, true);
    assert.equal(goodJson.data.attachment.originalName, 'valid_diagram.png');
  });
});
