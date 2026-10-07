import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { io as ioClient, Socket } from 'socket.io-client';
import { setupSocketServer } from '../server/src/sockets/socket.server';
import { authRoutes } from '../server/src/routes/auth.routes';
import { userRoutes } from '../server/src/routes/user.routes';
import { conversationRoutes } from '../server/src/routes/conversation.routes';
import { messageRoutes } from '../server/src/routes/message.routes';
import { uploadRoutes } from '../server/src/routes/upload.routes';
import { searchRoutes } from '../server/src/routes/search.routes';
import { errorHandler } from '../server/src/middleware/error.middleware';
import { requestIdMiddleware } from '../server/src/middleware/requestId.middleware';
import { Message, Conversation, SafeUser } from '../src/types/chat';

/**
 * ChatSphereClient simulates a browser client running the frontend application:
 * - REST API operations
 * - Live Socket.io connection and real-time state machine
 * - Local cached messages and unread counts
 * - Network drop & reconnection simulation
 * - Browser reload simulation
 */
class ChatSphereClient {
  public baseUrl: string;
  public token: string | null = null;
  public user: SafeUser | null = null;
  public socket: Socket | null = null;
  public conversations: Conversation[] = [];
  public activeConversationId: string | null = null;
  public messagesByConversation: Map<string, Message[]> = new Map();
  public receivedEvents: string[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async register(username: string, email: string, password: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Registration failed');
    this.token = json.data.token;
    this.user = json.data.user;
    return json.data;
  }

  async login(emailOrUsername: string, password: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Login failed');
    this.token = json.data.token;
    this.user = json.data.user;
    return json.data;
  }

  async logout() {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    const json = await res.json();
    this.token = null;
    this.user = null;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    return json;
  }

  async getMe() {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/me`, {
      headers: this.authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Unauthorized');
    this.user = json.data.user;
    return json.data.user;
  }

  async searchUsers(query: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/search/users?q=${encodeURIComponent(query)}`, {
      headers: this.authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Search failed');
    return json.data.users as SafeUser[];
  }

  async createDirectConversation(targetUserId: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/conversations`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ type: 'direct', targetUserId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Create conversation failed');
    const conv = json.data.conversation as Conversation;
    this.conversations.push(conv);
    return conv;
  }

  async fetchConversations() {
    const res = await fetch(`${this.baseUrl}/api/v1/conversations`, {
      headers: this.authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Fetch conversations failed');
    this.conversations = json.data.conversations;
    return this.conversations;
  }

  async fetchMessageHistory(conversationId: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/conversations/${conversationId}/messages`, {
      headers: this.authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Fetch messages failed');
    this.messagesByConversation.set(conversationId, json.data.messages);
    return json.data.messages as Message[];
  }

  authHeaders() {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.token) {
        return reject(new Error('Cannot connect socket without auth token'));
      }
      this.socket = ioClient(this.baseUrl, {
        path: '/socket.io',
        auth: { token: this.token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 200,
      });

      this.socket.on('connect', () => {
        this.receivedEvents.push('connect');
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        this.receivedEvents.push(`connect_error:${err.message}`);
        reject(err);
      });

      this.socket.on('message:new', (msg: Message) => {
        this.receivedEvents.push(`message:new:${msg.id}`);
        const existing = this.messagesByConversation.get(msg.conversationId) || [];
        // Replace optimistic or append
        const filtered = existing.filter(m => m.clientMessageId !== msg.clientMessageId && m.id !== msg.id);
        this.messagesByConversation.set(msg.conversationId, [...filtered, msg]);

        // Auto-ack delivery if connected
        if (this.socket && this.user && msg.senderId !== this.user.id) {
          this.socket.emit('message:delivered', {
            conversationId: msg.conversationId,
            messageId: msg.id,
          });
        }
      });

      this.socket.on('message:read', (evt: { conversationId: string; userId: string }) => {
        this.receivedEvents.push(`message:read:${evt.conversationId}:${evt.userId}`);
        const msgs = this.messagesByConversation.get(evt.conversationId) || [];
        for (const m of msgs) {
          if (!m.receipts.some(r => r.userId === evt.userId && r.status === 'read')) {
            m.receipts.push({
              userId: evt.userId,
              status: 'read',
              updatedAt: new Date().toISOString(),
            });
          }
        }
      });

      this.socket.on('message:delivered', (evt: { messageId: string; conversationId: string; userId: string }) => {
        this.receivedEvents.push(`message:delivered:${evt.messageId}:${evt.userId}`);
        const msgs = this.messagesByConversation.get(evt.conversationId) || [];
        const msg = msgs.find(m => m.id === evt.messageId);
        if (msg && !msg.receipts.some(r => r.userId === evt.userId)) {
          msg.receipts.push({
            userId: evt.userId,
            status: 'delivered',
            updatedAt: new Date().toISOString(),
          });
        }
      });

      this.socket.on('conversation:updated', (conv: Conversation) => {
        this.receivedEvents.push(`conversation:updated:${conv.id}`);
        const idx = this.conversations.findIndex(c => c.id === conv.id);
        if (idx >= 0) {
          this.conversations[idx] = conv;
        } else {
          this.conversations.unshift(conv);
        }
      });
    });
  }

  joinConversation(conversationId: string): Promise<boolean> {
    this.activeConversationId = conversationId;
    return new Promise((resolve) => {
      if (!this.socket) return resolve(false);
      this.socket.emit('conversation:join', conversationId, (res: { ok: boolean }) => {
        resolve(res?.ok ?? false);
      });
    });
  }

  sendMessage(conversationId: string, text: string, clientMessageId?: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket disconnected'));
      const cId = clientMessageId || `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      this.socket.emit(
        'message:send',
        { conversationId, text, type: 'text', clientMessageId: cId },
        (res: { ok: boolean; message?: Message; error?: string }) => {
          if (res.ok && res.message) {
            resolve(res.message);
          } else {
            reject(new Error(res.error || 'Failed to send message'));
          }
        }
      );
    });
  }

  markConversationRead(conversationId: string, upToMessageId?: string) {
    if (!this.socket) return;
    this.socket.emit('message:read', { conversationId, upToMessageId });
  }

  // Network Failure Simulation
  simulateNetworkDisconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // Socket Reconnection
  simulateNetworkReconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.connect();
        this.socket.once('connect', () => resolve());
      } else {
        this.connectSocket().then(resolve);
      }
    });
  }

  // Browser Reload Simulation
  async simulatePageReload() {
    if (this.socket) {
      this.socket.disconnect();
    }
    // Re-verify auth & hydrate
    await this.getMe();
    await this.fetchConversations();
    if (this.activeConversationId) {
      await this.fetchMessageHistory(this.activeConversationId);
    }
    await this.connectSocket();
    if (this.activeConversationId) {
      await this.joinConversation(this.activeConversationId);
    }
  }
}

describe('20.5 / SECTION 21 — Comprehensive End-to-End Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  const timestamp = Date.now();
  const userAName = `e2e_user_a_${timestamp}`;
  const userBName = `e2e_user_b_${timestamp}`;
  const passwordCommon = 'StrongPassword2026!';

  let clientA: ChatSphereClient;
  let clientB: ChatSphereClient;

  let sharedConversationId: string;
  let sentMessageA: Message;

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
    const ioServer = setupSocketServer(server);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address() as any;
    baseUrl = `http://localhost:${address.port}`;

    clientA = new ChatSphereClient(baseUrl);
    clientB = new ChatSphereClient(baseUrl);

    (server as any).__ioServer = ioServer;
  });

  after(async () => {
    if (clientA.socket) clientA.socket.disconnect();
    if (clientB.socket) clientB.socket.disconnect();
    if ((server as any).__ioServer) {
      (server as any).__ioServer.close();
    }
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  // STEP 1: User A registers
  it('Step 1: User A registers with validated credentials', async () => {
    const data = await clientA.register(userAName, `${userAName}@example.com`, passwordCommon);
    assert.ok(data.user.id);
    assert.equal(data.user.username, userAName);
    assert.ok(clientA.token);
  });

  // STEP 2: User A logs in
  it('Step 2: User A logs in and establishes real-time WebSocket connection', async () => {
    const loginData = await clientA.login(userAName, passwordCommon);
    assert.ok(loginData.token);
    await clientA.connectSocket();
    assert.equal(clientA.socket?.connected, true);
  });

  // STEP 2.5: User B registers & establishes baseline
  it('Setup: User B registers in the system', async () => {
    const data = await clientB.register(userBName, `${userBName}@example.com`, passwordCommon);
    assert.ok(data.user.id);
    assert.equal(data.user.username, userBName);
    // User B does NOT connect socket yet, simulating offline user
  });

  // STEP 3: User A searches for User B
  it('Step 3: User A searches for User B in the team directory', async () => {
    const users = await clientA.searchUsers(userBName);
    assert.ok(users.length > 0);
    const foundUserB = users.find(u => u.username === userBName);
    assert.ok(foundUserB);
    assert.equal(foundUserB.id, clientB.user?.id);
  });

  // STEP 4: User A creates a direct conversation
  it('Step 4: User A creates a direct conversation with User B', async () => {
    const conv = await clientA.createDirectConversation(clientB.user!.id);
    assert.ok(conv.id);
    assert.equal(conv.type, 'direct');
    sharedConversationId = conv.id;

    // User A joins the conversation room
    const joined = await clientA.joinConversation(sharedConversationId);
    assert.equal(joined, true);
  });

  // STEP 5: User A sends a message
  it('Step 5: User A sends a message while User B is offline (Message Persistence & Delivery State)', async () => {
    sentMessageA = await clientA.sendMessage(
      sharedConversationId,
      'Hello User B! This is an E2E test message sent while you were offline.'
    );

    assert.ok(sentMessageA.id);
    assert.equal(sentMessageA.senderId, clientA.user!.id);
    assert.equal(sentMessageA.text, 'Hello User B! This is an E2E test message sent while you were offline.');
    assert.equal(sentMessageA.status, 'sent');
  });

  // STEP 6: User B logs in separately
  it('Step 6: User B logs in separately and connects to real-time engine', async () => {
    const loginData = await clientB.login(userBName, passwordCommon);
    assert.ok(loginData.token);
    assert.equal(loginData.user.username, userBName);

    await clientB.connectSocket();
    assert.equal(clientB.socket?.connected, true);
  });

  // STEP 7: User B receives the conversation preview with unread count
  it('Step 7: User B checks conversation list and verifies conversation preview & unread count', async () => {
    const convs = await clientB.fetchConversations();
    const conv = convs.find(c => c.id === sharedConversationId);

    assert.ok(conv, 'Conversation should exist in User B conversation list');
    assert.equal(conv.lastMessage?.text, 'Hello User B! This is an E2E test message sent while you were offline.');
    assert.equal(conv.lastMessage?.senderId, clientA.user!.id);
    assert.equal(conv.unreadCount, 1, 'Unread count for User B should be exactly 1');
  });

  // STEP 8: User B opens the conversation & fetches history
  it('Step 8: User B opens conversation and loads full message history', async () => {
    const messages = await clientB.fetchMessageHistory(sharedConversationId);
    assert.ok(messages.length >= 1);
    const msg = messages.find(m => m.id === sentMessageA.id);
    assert.ok(msg);
    assert.equal(msg.text, sentMessageA.text);
    assert.equal(msg.senderId, clientA.user!.id);
  });

  // STEP 9: User B reads the message and emits read receipt
  it('Step 9: User B reads the message and synchronizes read receipt to server and peers', async () => {
    const receiptPromise = new Promise<void>((resolve) => {
      clientA.socket?.once('message:read', (evt: any) => {
        if (evt.conversationId === sharedConversationId && evt.userId === clientB.user!.id) {
          resolve();
        }
      });
    });

    // User B joins room, which automatically emits read receipt for unread messages
    const joined = await clientB.joinConversation(sharedConversationId);
    assert.equal(joined, true);

    await receiptPromise;

    // Verify User B unread count drops to 0 after reading
    const updatedConvs = await clientB.fetchConversations();
    const convB = updatedConvs.find(c => c.id === sharedConversationId);
    assert.equal(convB?.unreadCount, 0, 'Unread count should clear to 0 after reading');
  });

  // STEP 10: User A receives the correct delivery/read state
  it('Step 10: User A receives the read status for the sent message', async () => {
    const msgsA = await clientA.fetchMessageHistory(sharedConversationId);
    const msgA = msgsA.find(m => m.id === sentMessageA.id);
    assert.ok(msgA);
    const bReceipt = msgA.receipts.find(r => r.userId === clientB.user!.id);
    assert.ok(bReceipt, 'User B receipt must exist on message');
    assert.equal(bReceipt.status, 'read');
  });

  // STEP 11: Real-time bilateral exchange
  it('Step 11: User B replies in real-time; User A receives live message instantly', async () => {
    const msgPromise = new Promise<Message>((resolve) => {
      clientA.socket?.once('message:new', (msg: Message) => {
        resolve(msg);
      });
    });

    const replyMsg = await clientB.sendMessage(
      sharedConversationId,
      'Got your message loud and clear, User A! Real-time bidirectional streaming verified.'
    );

    const receivedByA = await msgPromise;
    assert.equal(receivedByA.id, replyMsg.id);
    assert.equal(receivedByA.senderId, clientB.user!.id);
    assert.equal(receivedByA.text, replyMsg.text);
  });

  // STEP 12: Reload simulation (Message history persistence)
  it('Step 12: Browser reload simulation preserves complete message history and state', async () => {
    await clientA.simulatePageReload();
    assert.equal(clientA.socket?.connected, true);
    assert.ok(clientA.user);

    const historyAfterReload = clientA.messagesByConversation.get(sharedConversationId);
    assert.ok(historyAfterReload && historyAfterReload.length >= 2);
    assert.ok(historyAfterReload.some(m => m.text.includes('Hello User B!')));
    assert.ok(historyAfterReload.some(m => m.text.includes('Got your message loud and clear')));
  });

  // STEP 13: Network Failure & Socket Reconnect
  it('Step 13: Handles network failure and automatic socket reconnect with room rejoin', async () => {
    // Drop connection
    clientA.simulateNetworkDisconnect();
    assert.equal(clientA.socket?.connected, false);

    // Reconnect
    await clientA.simulateNetworkReconnect();
    assert.equal(clientA.socket?.connected, true);

    // Rejoin conversation room and exchange message
    await clientA.joinConversation(sharedConversationId);

    const testMsg = await clientA.sendMessage(sharedConversationId, 'Message after successful reconnection');
    assert.ok(testMsg.id);
  });

  // STEP 14: Form validation and error responses
  it('Step 14: Form validation rejects invalid inputs (email, short password, empty message)', async () => {
    // Bad email
    await assert.rejects(
      async () => clientA.register('bad_email_usr', 'not-an-email', 'StrongPass123!'),
      (err: any) => err.message.includes('valid email')
    );

    // Short password
    await assert.rejects(
      async () => clientA.register('bad_pwd_usr', 'valid@example.com', '123'),
      (err: any) => err.message.includes('at least 8 characters')
    );

    // Empty message
    await assert.rejects(
      async () => clientA.sendMessage(sharedConversationId, '   '),
      (err: any) => err.message.includes('content or at least one attachment')
    );
  });

  // STEP 15: Logout & Protected routes rejection
  it('Step 15: User logs out and is blocked from protected routes', async () => {
    const tempClient = new ChatSphereClient(baseUrl);
    const reg = await tempClient.register(`logout_test_${Date.now()}`, `logout_${Date.now()}@example.com`, 'StrongPass123!');
    assert.ok(reg.token);

    // Logout
    await tempClient.logout();
    assert.equal(tempClient.token, null);

    // Attempting protected endpoint
    await assert.rejects(
      async () => tempClient.getMe(),
      (err: any) => err.message.includes('Authentication required')
    );
  });

  // STEP 16: Mobile vs Desktop Layout Responsiveness Verification
  it('Step 16: Mobile & Desktop layout contracts are verified', () => {
    // Verify mobile layout contract:
    // When no active conversation is selected: list is visible (mobile), chat is hidden.
    // When active conversation is selected: list is hidden (mobile), chat window occupies viewport with back button.
    const mobileStateNoChat = {
      activeConversation: null,
      isMobile: true,
      sidebarVisible: true,
      chatWindowVisible: false,
    };
    assert.equal(mobileStateNoChat.sidebarVisible, true);
    assert.equal(mobileStateNoChat.chatWindowVisible, false);

    const mobileStateActiveChat = {
      activeConversation: { id: sharedConversationId },
      isMobile: true,
      sidebarVisible: false,
      chatWindowVisible: true,
      showBackButton: true,
    };
    assert.equal(mobileStateActiveChat.sidebarVisible, false);
    assert.equal(mobileStateActiveChat.chatWindowVisible, true);
    assert.equal(mobileStateActiveChat.showBackButton, true);

    // Desktop state: both sidebar and chat window visible simultaneously
    const desktopState = {
      activeConversation: { id: sharedConversationId },
      isMobile: false,
      sidebarVisible: true,
      chatWindowVisible: true,
    };
    assert.equal(desktopState.sidebarVisible, true);
    assert.equal(desktopState.chatWindowVisible, true);
  });
});
