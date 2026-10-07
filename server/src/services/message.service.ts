import { messageRepository, CursorPaginationOptions } from '../repositories/message.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { userRepository } from '../repositories/user.repository';
import { presenceService } from './presence.service';
import { authService } from './auth.service';
import { Message, MessageDeliveryStatus, SafeUser } from '../../../src/types/chat';
import { ValidationError, ForbiddenError, NotFoundError } from '../utils/errors';
import { createSignedDownloadToken } from '../utils/fileSecurity';

export class MessageService {
  async formatMessage(msg: any, currentUserId?: string): Promise<Message> {
    const sender = await userRepository.findById(msg.senderId);
    const safeSender = sender ? authService.toSafeUser(sender) : undefined;

    // Compute delivery status relative to current user
    let status: MessageDeliveryStatus = 'sent';
    if (msg.senderId === currentUserId) {
      const hasRead = msg.receipts?.some((r: any) => r.status === 'read');
      const hasDelivered = msg.receipts?.some((r: any) => r.status === 'delivered');
      if (hasRead) {
        status = 'read';
      } else if (hasDelivered) {
        status = 'delivered';
      } else {
        status = 'sent';
      }
    }

    let attachments = msg.attachments;
    if (attachments && attachments.length > 0 && currentUserId) {
      attachments = attachments.map((att: any) => {
        const attId = att.id || att._id;
        if (!attId) return att;
        const signed = createSignedDownloadToken(attId, currentUserId, 900);
        return {
          ...att,
          id: attId,
          url: `/api/v1/uploads/${attId}/download?token=${signed.token}`,
          thumbnailUrl: att.mimeType?.startsWith('image/')
            ? `/api/v1/uploads/${attId}/download?token=${signed.token}&inline=true`
            : undefined,
        };
      });
    }

    return {
      id: msg._id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      sender: safeSender,
      clientMessageId: msg.clientMessageId,
      type: msg.type,
      text: msg.text,
      attachments,
      replyToId: msg.replyToId,
      replyTo: msg.replyTo,
      receipts: msg.receipts || [],
      status,
      editedAt: msg.editedAt,
      deletedAt: msg.deletedAt,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    payload: {
      text: string;
      type?: 'text' | 'image' | 'file' | 'system';
      attachments?: any[];
      replyToId?: string;
      clientMessageId?: string;
    }
  ): Promise<Message> {
    const hasText = payload.text && payload.text.trim().length > 0;
    const hasAttachments = payload.attachments && payload.attachments.length > 0;
    if (!hasText && !hasAttachments) {
      throw new ValidationError('Message must have text content or at least one attachment');
    }

    const conv = await conversationRepository.findById(conversationId);
    if (!conv) {
      throw new NotFoundError('Conversation not found');
    }

    const isMember = conv.members.some(m => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenError('Forbidden: You are not a member of this conversation');
    }

    // Idempotency check with clientMessageId
    if (payload.clientMessageId) {
      const existing = await messageRepository.findByClientMessageId(conversationId, payload.clientMessageId);
      if (existing) {
        return this.formatMessage(existing, userId);
      }
    }

    const sender = await userRepository.findById(userId);
    if (!sender) {
      throw new Error('Sender user does not exist');
    }

    let replyTo: { id: string; senderUsername: string; text: string } | undefined;
    if (payload.replyToId) {
      const replyMsg = await messageRepository.findById(payload.replyToId);
      if (replyMsg) {
        const replySender = await userRepository.findById(replyMsg.senderId);
        replyTo = {
          id: replyMsg._id,
          senderUsername: replySender?.username || 'user',
          text: replyMsg.deletedAt ? 'This message was deleted' : replyMsg.text.slice(0, 100),
        };
      }
    }

    const now = new Date().toISOString();
    const receipts: { userId: string; status: 'delivered' | 'read'; updatedAt: string }[] = [];

    // Automatically mark delivered for online members (excluding sender)
    for (const member of conv.members) {
      if (member.userId !== userId && presenceService.isUserOnline(member.userId)) {
        receipts.push({
          userId: member.userId,
          status: 'delivered',
          updatedAt: now,
        });
      }
    }

    const created = await messageRepository.create({
      conversationId,
      senderId: userId,
      clientMessageId: payload.clientMessageId,
      type: payload.type || 'text',
      text: payload.text.trim(),
      attachments: payload.attachments,
      replyToId: payload.replyToId,
      replyTo,
      receipts,
    });

    // Update conversation lastMessage preview
    await conversationRepository.updateLastMessage(conversationId, {
      id: created._id,
      senderId: userId,
      senderUsername: sender.username,
      text: payload.type === 'image' ? 'Sent an image' : payload.type === 'file' ? 'Sent a file' : payload.text.trim(),
      type: payload.type || 'text',
      createdAt: created.createdAt,
    });

    return this.formatMessage(created, userId);
  }

  async getMessages(
    userId: string,
    conversationId: string,
    options: CursorPaginationOptions = {}
  ): Promise<{ messages: Message[]; nextCursor: string | null; hasMore: boolean }> {
    const conv = await conversationRepository.findById(conversationId);
    if (!conv) {
      throw new Error('Conversation not found');
    }

    const isMember = conv.members.some(m => m.userId === userId);
    if (!isMember) {
      throw new Error('Forbidden: You are not a member of this conversation');
    }

    const result = await messageRepository.getMessages(conversationId, options);
    const formatted = await Promise.all(
      result.messages.map(m => this.formatMessage(m, userId))
    );

    return {
      messages: formatted,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async editMessage(userId: string, messageId: string, newText: string): Promise<Message> {
    const msg = await messageRepository.findById(messageId);
    if (!msg) throw new Error('Message not found');

    if (msg.senderId !== userId) {
      throw new Error('Forbidden: You can only edit your own messages');
    }
    if (msg.deletedAt) {
      throw new Error('Cannot edit a deleted message');
    }

    const cleanText = newText.trim();
    if (!cleanText) {
      throw new Error('Message content cannot be empty');
    }

    const updated = await messageRepository.update(messageId, {
      text: cleanText,
      editedAt: new Date().toISOString(),
    });

    return this.formatMessage(updated!, userId);
  }

  async deleteMessage(userId: string, messageId: string): Promise<Message> {
    const msg = await messageRepository.findById(messageId);
    if (!msg) throw new Error('Message not found');

    const conv = await conversationRepository.findById(msg.conversationId);
    const isSender = msg.senderId === userId;
    const isAdmin = conv?.members.some(m => m.userId === userId && m.role === 'admin');

    if (!isSender && !isAdmin) {
      throw new Error('Forbidden: You do not have permission to delete this message');
    }

    const deleted = await messageRepository.softDelete(messageId);
    return this.formatMessage(deleted!, userId);
  }

  async markMessageDelivered(userId: string, conversationId: string, messageId: string): Promise<Message | null> {
    const msg = await messageRepository.findById(messageId);
    if (!msg || msg.conversationId !== conversationId) return null;
    if (msg.senderId === userId) return null; // Can't deliver to self

    const updated = await messageRepository.updateReceipt(messageId, userId, 'delivered');
    return updated ? this.formatMessage(updated, userId) : null;
  }

  async markConversationRead(
    userId: string,
    conversationId: string,
    upToMessageId?: string
  ): Promise<string[]> {
    const conv = await conversationRepository.findById(conversationId);
    if (!conv) return [];

    const isMember = conv.members.some(m => m.userId === userId);
    if (!isMember) return [];

    const updatedIds = await messageRepository.markAllReadInConversation(conversationId, userId, upToMessageId);
    if (upToMessageId) {
      await conversationRepository.updateMemberRead(conversationId, userId, upToMessageId);
    }

    return updatedIds;
  }

  async searchMessages(userId: string, conversationId: string, query: string): Promise<Message[]> {
    const conv = await conversationRepository.findById(conversationId);
    if (!conv) throw new Error('Conversation not found');

    const isMember = conv.members.some(m => m.userId === userId);
    if (!isMember) throw new Error('Forbidden: Not a member');

    const results = await messageRepository.searchMessages(conversationId, query);
    return Promise.all(results.map(m => this.formatMessage(m, userId)));
  }
}

export const messageService = new MessageService();
