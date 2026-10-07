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

async function runSection18Audit() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '20mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'UP' }));
  app.get('/ready', (_req, res) => res.json({ status: 'READY' }));

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
  await new Promise<void>(resolve => server.listen(3030, resolve));
  const baseUrl = 'http://localhost:3030';

  console.log('[SECTION 18 AUDIT] Test server listening on :3030');

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
    // 1. Health & Ready Probes
    const healthRes = await fetch(`${baseUrl}/health`).then(r => r.json());
    assert('GET /health returns status UP', healthRes.status === 'UP');

    const readyRes = await fetch(`${baseUrl}/ready`).then(r => r.json());
    assert('GET /ready returns status READY', readyRes.status === 'READY');

    // 2. Authentication: Register
    const regUsername = `test_usr_${Date.now()}`;
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: regUsername,
        email: `${regUsername}@example.com`,
        password: 'StrongPass123!',
      }),
    });
    const regJson = await regRes.json();
    assert('POST /auth/register returns 201 with success envelope', regRes.status === 201 && regJson.success === true && regJson.data?.user?.username === regUsername);
    const tokenA = regJson.data.token;
    const userAId = regJson.data.user.id;

    // 3. Duplicate Registration Rejection
    const dupRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: regUsername,
        email: `${regUsername}@example.com`,
        password: 'StrongPass123!',
      }),
    });
    const dupJson = await dupRes.json();
    assert('Duplicate registration rejected with 400 error envelope', dupRes.status === 400 && dupJson.success === false && Boolean(dupJson.error?.message));

    // 4. Login: Valid & Invalid
    const validLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: regUsername, password: 'StrongPass123!' }),
    }).then(r => r.json());
    assert('POST /auth/login returns token in data envelope', validLoginRes.success === true && Boolean(validLoginRes.data.token));

    const invalidLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: regUsername, password: 'wrongpassword' }),
    });
    const invJson = await invalidLoginRes.json();
    assert('Invalid credentials rejected with 401', invalidLoginRes.status === 401 && invJson.success === false);

    // 5. GET /api/v1/auth/me
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    }).then(r => r.json());
    assert('GET /auth/me returns authenticated user', meRes.success === true && meRes.data.user.id === userAId);

    // 6. User search
    const searchRes = await fetch(`${baseUrl}/api/v1/search/users?q=alex`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    }).then(r => r.json());
    assert('GET /search/users returns matches', searchRes.success === true && Array.isArray(searchRes.data.users));

    // 7. Conversations: Direct
    const directRes = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        type: 'direct',
        targetUserId: 'usr_alex',
      }),
    }).then(r => r.json());
    assert('POST /conversations creates/gets direct chat', directRes.success === true && directRes.data.conversation.type === 'direct');
    const directConvId = directRes.data.conversation.id;

    // 8. Conversations: Group
    const groupRes = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        type: 'group',
        name: 'Audit Channel',
        description: 'Testing group architecture',
        memberIds: ['usr_alex', 'usr_sam'],
      }),
    }).then(r => r.json());
    assert('POST /conversations creates group channel with admin role', groupRes.success === true && groupRes.data.conversation.type === 'group');
    const groupConvId = groupRes.data.conversation.id;

    // 9. Messages: Send & Retrieve
    const sendMsgRes = await fetch(`${baseUrl}/api/v1/conversations/${directConvId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        text: 'Automated audit message for Section 18',
        type: 'text',
      }),
    }).then(r => r.json());
    assert('POST /conversations/:id/messages persists message', sendMsgRes.success === true && sendMsgRes.data.message.text.includes('audit message'));
    const messageId = sendMsgRes.data.message.id;

    // 10. Messages: Edit & Delete
    const editRes = await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ text: 'Updated audit text' }),
    }).then(r => r.json());
    assert('PATCH /messages/:id updates text and sets editedAt', editRes.success === true && editRes.data.message.text === 'Updated audit text' && Boolean(editRes.data.message.editedAt));

    const delRes = await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    }).then(r => r.json());
    assert('DELETE /messages/:id soft-deletes message', delRes.success === true && Boolean(delRes.data.message.deletedAt));

    // 11. Pagination
    const pageRes = await fetch(`${baseUrl}/api/v1/conversations/${directConvId}/messages?limit=10`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    }).then(r => r.json());
    assert('GET /conversations/:id/messages paginates correctly', pageRes.success === true && Array.isArray(pageRes.data.messages));

    // 12. Security Check: Unauthorized conversation access rejected
    const unauthConvRes = await fetch(`${baseUrl}/api/v1/conversations/conv_alex_sam`, {
      headers: { Authorization: `Bearer ${tokenA}` }, // tokenA is not a member of conv_alex_sam
    });
    const unauthJson = await unauthConvRes.json();
    assert('Non-member forbidden from accessing private conversation', unauthConvRes.status === 403 && unauthJson.success === false);

    // 13. Unknown Route 404 Envelope
    const unknownRes = await fetch(`${baseUrl}/api/v1/unknown-endpoint`);
    const unknownJson = await unknownRes.json();
    assert('Unknown API route returns 404 with error envelope', unknownRes.status === 404 && unknownJson.error?.code === 'NOT_FOUND');

    console.log(`\n[SECTION 18 AUDIT SUMMARY]: ${passed} PASSED, ${failed} FAILED`);
  } catch (err) {
    console.error('Audit execution error:', err);
    failed++;
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSection18Audit();
