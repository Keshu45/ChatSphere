import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import { io as ioClient, Socket } from 'socket.io-client';
import { setupSocketServer } from '../server/src/sockets/socket.server';
import { conversationService } from '../server/src/services/conversation.service';
import { authService } from '../server/src/services/auth.service';
import { signToken } from '../server/src/utils/jwt';
import { presenceService } from '../server/src/services/presence.service';

describe('20.4 Socket.io Real-Time Tests', () => {
  let httpServer: http.Server;
  let serverPort: number;
  let serverUrl: string;

  let userAId: string;
  let tokenUserA: string;

  let userBId: string;
  let tokenUserB: string;

  let userCId: string;
  let tokenUserC: string;

  let directConvId: string;

  before(async () => {
    const app = express();
    httpServer = http.createServer(app);
    setupSocketServer(httpServer);

    await new Promise<void>(resolve => httpServer.listen(3034, resolve));
    serverPort = 3034;
    serverUrl = `http://localhost:${serverPort}`;

    // Create 3 users for real-time testing
    const uA = await authService.register(`ws_usr_a_${Date.now()}`, `ws_a_${Date.now()}@example.com`, 'StrongPass123!');
    userAId = uA.user.id;
    tokenUserA = uA.token;

    const uB = await authService.register(`ws_usr_b_${Date.now()}`, `ws_b_${Date.now()}@example.com`, 'StrongPass123!');
    userBId = uB.user.id;
    tokenUserB = uB.token;

    const uC = await authService.register(`ws_usr_c_${Date.now()}`, `ws_c_${Date.now()}@example.com`, 'StrongPass123!');
    userCId = uC.user.id;
    tokenUserC = uC.token;

    // Create direct conversation between A and B
    const conv = await conversationService.getOrCreateDirectConversation(userAId, userBId);
    directConvId = conv.id;
  });

  after(async () => {
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  });

  it('1. Unauthenticated connection rejection: disconnects if token missing or invalid', async () => {
    const socket = ioClient(serverUrl, {
      path: '/socket.io',
      auth: { token: 'invalid-or-missing-token' },
      autoConnect: true,
      reconnection: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      socket.on('connect_error', (err) => resolve(err.message));
    });

    const message = await errorPromise;
    assert.ok(message.includes('Authentication failed'));
    socket.disconnect();
  });

  it('2. Authenticated connection: connects successfully with valid token', async () => {
    const socket = ioClient(serverUrl, {
      path: '/socket.io',
      auth: { token: tokenUserA },
      autoConnect: true,
      reconnection: false,
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    assert.equal(socket.connected, true);
    assert.ok(presenceService.isUserOnline(userAId));
    socket.disconnect();
  });

  it('3. Authorized vs Unauthorized room joining', async () => {
    const socketA = ioClient(serverUrl, {
      path: '/socket.io',
      auth: { token: tokenUserA },
    });
    const socketC = ioClient(serverUrl, {
      path: '/socket.io',
      auth: { token: tokenUserC },
    });

    await Promise.all([
      new Promise<void>(res => socketA.on('connect', res)),
      new Promise<void>(res => socketC.on('connect', res)),
    ]);

    // Member (User A) joins room -> Success
    const ackA = await new Promise<{ ok: boolean }>(res => {
      socketA.emit('conversation:join', directConvId, res);
    });
    assert.equal(ackA.ok, true);

    // Non-member (User C) joins room -> Rejection
    const ackC = await new Promise<{ ok: boolean; error?: string }>(res => {
      socketC.emit('conversation:join', directConvId, res);
    });
    assert.equal(ackC.ok, false);
    assert.ok(ackC.error?.includes('Unauthorized to join room'));

    socketA.disconnect();
    socketC.disconnect();
  });

  it('4. Real-time message delivery & Acknowledgement', async () => {
    const socketA = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserA } });
    const socketB = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserB } });

    await Promise.all([
      new Promise<void>(res => socketA.on('connect', res)),
      new Promise<void>(res => socketB.on('connect', res)),
    ]);

    // Both join conversation room
    await Promise.all([
      new Promise<void>(res => socketA.emit('conversation:join', directConvId, () => res())),
      new Promise<void>(res => socketB.emit('conversation:join', directConvId, () => res())),
    ]);

    const incomingPromise = new Promise<any>((resolve) => {
      socketB.on('message:new', (msg) => resolve(msg));
    });

    // User A sends message with ACK
    const ack = await new Promise<{ ok: boolean; message?: any }>(res => {
      socketA.emit('message:send', {
        conversationId: directConvId,
        text: 'Live real-time WebSocket test',
      }, res);
    });

    assert.equal(ack.ok, true);
    assert.ok(ack.message?.id);
    assert.equal(ack.message.text, 'Live real-time WebSocket test');

    // User B receives broadcast
    const received = await incomingPromise;
    assert.equal(received.id, ack.message.id);
    assert.equal(received.text, 'Live real-time WebSocket test');

    socketA.disconnect();
    socketB.disconnect();
  });

  it('5. Duplicate message prevention via clientMessageId', async () => {
    const socketA = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserA } });
    await new Promise<void>(res => socketA.on('connect', res));

    const clientMsgId = `cmsg_socket_${Date.now()}`;

    // Send 1st
    const res1 = await new Promise<any>(res => {
      socketA.emit('message:send', {
        conversationId: directConvId,
        text: 'Idempotent test',
        clientMessageId: clientMsgId,
      }, res);
    });

    // Send 2nd identical
    const res2 = await new Promise<any>(res => {
      socketA.emit('message:send', {
        conversationId: directConvId,
        text: 'Idempotent test',
        clientMessageId: clientMsgId,
      }, res);
    });

    assert.equal(res1.ok, true);
    assert.equal(res2.ok, true);
    assert.equal(res1.message.id, res2.message.id);

    socketA.disconnect();
  });

  it('6. Typing indicators broadcast excluding sender', async () => {
    const socketA = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserA } });
    const socketB = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserB } });

    await Promise.all([
      new Promise<void>(res => socketA.on('connect', res)),
      new Promise<void>(res => socketB.on('connect', res)),
    ]);

    await Promise.all([
      new Promise<void>(res => socketA.emit('conversation:join', directConvId, () => res())),
      new Promise<void>(res => socketB.emit('conversation:join', directConvId, () => res())),
    ]);

    const typingPromise = new Promise<any>((resolve) => {
      socketB.on('typing:update', (event) => resolve(event));
    });

    socketA.emit('typing:start', directConvId);

    const typingEvent = await typingPromise;
    assert.equal(typingEvent.conversationId, directConvId);
    assert.equal(typingEvent.userId, userAId);
    assert.equal(typingEvent.isTyping, true);

    socketA.disconnect();
    socketB.disconnect();
  });

  it('7. Delivery and Read Receipts synchronization', async () => {
    const socketA = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserA } });
    const socketB = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserB } });

    await Promise.all([
      new Promise<void>(res => socketA.on('connect', res)),
      new Promise<void>(res => socketB.on('connect', res)),
    ]);

    await Promise.all([
      new Promise<void>(res => socketA.emit('conversation:join', directConvId, () => res())),
      new Promise<void>(res => socketB.emit('conversation:join', directConvId, () => res())),
    ]);

    // Send a message from A
    const sendRes = await new Promise<any>(res => {
      socketA.emit('message:send', {
        conversationId: directConvId,
        text: 'Receipt sync test',
      }, res);
    });
    const msgId = sendRes.message.id;

    // Listen on A for read receipt
    const readReceiptPromise = new Promise<any>((resolve) => {
      socketA.on('message:read', (evt) => resolve(evt));
    });

    // B emits read
    socketB.emit('message:read', { conversationId: directConvId, upToMessageId: msgId });

    const readEvt = await readReceiptPromise;
    assert.equal(readEvt.conversationId, directConvId);
    assert.equal(readEvt.userId, userBId);

    socketA.disconnect();
    socketB.disconnect();
  });

  it('8. Multiple devices presence and disconnect transitions', async () => {
    // Connect device 1 for User A
    const sockDev1 = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserA } });
    await new Promise<void>(res => sockDev1.on('connect', res));
    assert.equal(presenceService.isUserOnline(userAId), true);

    // Connect device 2 for User A
    const sockDev2 = ioClient(serverUrl, { path: '/socket.io', auth: { token: tokenUserA } });
    await new Promise<void>(res => sockDev2.on('connect', res));
    assert.equal(presenceService.isUserOnline(userAId), true);

    // Disconnect device 1 -> user still online
    sockDev1.disconnect();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(presenceService.isUserOnline(userAId), true);

    // Disconnect device 2 -> user offline
    sockDev2.disconnect();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(presenceService.isUserOnline(userAId), false);
  });
});
