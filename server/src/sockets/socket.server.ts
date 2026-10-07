import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { socketAuthMiddleware, AuthenticatedSocket } from './socket.auth';
import { presenceService } from '../services/presence.service';
import { messageService } from '../services/message.service';
import { conversationService } from '../services/conversation.service';
import { conversationRepository } from '../repositories/conversation.repository';
import { logger } from '../utils/logger';

export let ioInstance: SocketIOServer | null = null;

export function setupSocketServer(httpServer: HTTPServer): SocketIOServer {
  const allowedOrigin = process.env.CLIENT_URL || '*';
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    logger.info('Distributed Redis adapter configured for real-time socket cluster', {
      redis: redisUrl.replace(/:([^:@]{1,})@/, ':****@'),
    });
  }

  ioInstance = io;

  // Enforce authentication on all socket connections
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect();
      return;
    }

    const userId = user.userId;
    const socketId = socket.id;

    logger.info('Real-time socket client connected', { userId, socketId });

    // Global socket error listener
    socket.on('error', (err: any) => {
      logger.error('Socket client error', err, { userId, socketId });
    });

    // Join private user room for personal notifications
    socket.join(`user:${userId}`);

    // Update presence tracking
    const { isFirstConnection } = presenceService.userConnected(userId, socketId);
    if (isFirstConnection) {
      io.emit('presence:update', {
        userId,
        status: 'online',
        lastSeenAt: new Date().toISOString(),
      });
    }

    // 1. Join Conversation Room with Server-Side Membership Verification
    socket.on('conversation:join', async (conversationId: string, ack?: (res: { ok: boolean; error?: string }) => void) => {
      try {
        if (!conversationId) {
          throw new Error('conversationId is required');
        }

        const conv = await conversationRepository.findById(conversationId);
        if (!conv) {
          const err = 'Conversation not found';
          socket.emit('error', { code: 'NOT_FOUND', message: err });
          if (ack) ack({ ok: false, error: err });
          return;
        }

        const isMember = conv.members.some(m => m.userId === userId);
        if (!isMember) {
          const err = 'Unauthorized to join room: not a member';
          socket.emit('error', { code: 'FORBIDDEN', message: err });
          if (ack) ack({ ok: false, error: err });
          return;
        }

        socket.join(`conv:${conversationId}`);

        // Mark unread messages in this conversation as delivered for this newly active member
        const updatedDeliveredIds = await messageService.markConversationRead(userId, conversationId);
        if (updatedDeliveredIds.length > 0) {
          io.to(`conv:${conversationId}`).emit('message:read', {
            conversationId,
            userId,
            updatedAt: new Date().toISOString(),
          });
        }

        if (ack) ack({ ok: true });
      } catch (err: any) {
        logger.error('Error in conversation:join', err, { userId, socketId, conversationId });
        socket.emit('error', { code: 'SOCKET_JOIN_ERROR', message: err.message });
        if (ack) ack({ ok: false, error: err.message });
      }
    });

    // 2. Leave Conversation Room
    socket.on('conversation:leave', (conversationId: string) => {
      if (conversationId) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    // 3. Message Send Handler with Idempotency & Persistence
    socket.on('message:send', async (payload: {
      conversationId: string;
      text: string;
      type?: 'text' | 'image' | 'file' | 'system';
      attachments?: any[];
      replyToId?: string;
      clientMessageId?: string;
    }, ack?: (response: { ok: boolean; message?: any; error?: string }) => void) => {
      try {
        if (!payload || !payload.conversationId) {
          throw new Error('Invalid message payload: conversationId required');
        }

        const message = await messageService.sendMessage(userId, payload.conversationId, {
          text: payload.text,
          type: payload.type,
          attachments: payload.attachments,
          replyToId: payload.replyToId,
          clientMessageId: payload.clientMessageId,
        });

        // Immediately acknowledge sender so their UI reconciles in sub-millisecond time
        if (ack) ack({ ok: true, message });

        // Broadcast to all connected members in the conversation room
        io.to(`conv:${payload.conversationId}`).emit('message:new', message);

        // Also notify members' personal rooms in case they haven't opened the conversation yet
        const conv = await conversationRepository.findById(payload.conversationId);
        if (conv) {
          const hydratedConv = await conversationService.formatConversation(conv, userId);
          for (const member of conv.members) {
            io.to(`user:${member.userId}`).emit('conversation:updated', hydratedConv);
          }
        }
      } catch (err: any) {
        logger.error('Error in message:send', err, { userId, socketId, conversationId: payload?.conversationId });
        socket.emit('error', { code: 'MESSAGE_SEND_ERROR', message: err.message || 'Failed to send message' });
        if (ack) ack({ ok: false, error: err.message || 'Failed to send message' });
      }
    });

    // 4. Message Delivered Receipt Handler
    socket.on('message:delivered', async (payload: { conversationId: string; messageId: string }) => {
      try {
        if (!payload?.conversationId || !payload?.messageId) return;
        // Verify socket is joined or authorized for room
        if (!socket.rooms.has(`conv:${payload.conversationId}`)) {
          const conv = await conversationRepository.findById(payload.conversationId);
          if (!conv || !conv.members.some(m => m.userId === userId)) return;
        }
        const updated = await messageService.markMessageDelivered(userId, payload.conversationId, payload.messageId);
        if (updated) {
          io.to(`conv:${payload.conversationId}`).emit('message:delivered', {
            messageId: payload.messageId,
            conversationId: payload.conversationId,
            userId,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        logger.error('Error handling message:delivered', err, { userId, socketId });
      }
    });

    // 5. Message Read Receipt Handler
    socket.on('message:read', async (payload: { conversationId: string; upToMessageId?: string }) => {
      try {
        if (!payload?.conversationId) return;
        // Verify socket is joined or authorized for room
        if (!socket.rooms.has(`conv:${payload.conversationId}`)) {
          const conv = await conversationRepository.findById(payload.conversationId);
          if (!conv || !conv.members.some(m => m.userId === userId)) return;
        }
        const updatedIds = await messageService.markConversationRead(userId, payload.conversationId, payload.upToMessageId);
        if (updatedIds.length > 0) {
          io.to(`conv:${payload.conversationId}`).emit('message:read', {
            conversationId: payload.conversationId,
            userId,
            updatedAt: new Date().toISOString(),
          });

          // Refresh unread counts for current user
          const conv = await conversationRepository.findById(payload.conversationId);
          if (conv) {
            const formatted = await conversationService.formatConversation(conv, userId);
            socket.emit('conversation:updated', formatted);
          }
        }
      } catch (err: any) {
        logger.error('Error handling message:read', err, { userId, socketId });
      }
    });

    // 6. Typing Indicators (debounced & validated)
    socket.on('typing:start', async (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string') return;
      // Authorize typing event against room membership
      if (!socket.rooms.has(`conv:${conversationId}`)) {
        const conv = await conversationRepository.findById(conversationId);
        if (!conv || !conv.members.some(m => m.userId === userId)) return;
      }
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        username: user.username,
        isTyping: true,
      });
    });

    socket.on('typing:stop', async (conversationId: string) => {
      if (!conversationId || typeof conversationId !== 'string') return;
      if (!socket.rooms.has(`conv:${conversationId}`)) {
        const conv = await conversationRepository.findById(conversationId);
        if (!conv || !conv.members.some(m => m.userId === userId)) return;
      }
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        username: user.username,
        isTyping: false,
      });
    });

    // 7. Presence Query
    socket.on('presence:subscribe', (ack?: (onlineUserIds: string[]) => void) => {
      try {
        if (ack) {
          ack(presenceService.getOnlineUserIds());
        }
      } catch (err: any) {
        logger.error('Error handling presence:subscribe', err);
      }
    });

    // 8. Handle Disconnection
    socket.on('disconnect', (reason: string) => {
      logger.info('Real-time socket client disconnected', { userId, socketId, reason });
      const { isLastConnection } = presenceService.userDisconnected(socketId);
      if (isLastConnection) {
        io.emit('presence:update', {
          userId,
          status: 'offline',
          lastSeenAt: new Date().toISOString(),
        });
      }
    });
  });

  return io;
}
