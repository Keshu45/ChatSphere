import { db, MessageDoc } from '../db/storage';

export interface CursorPaginationOptions {
  cursor?: string; // message ID to fetch before (older messages)
  limit?: number;
}

export class MessageRepository {
  async findById(id: string): Promise<MessageDoc | null> {
    const msg = db.getMessageById(id);
    return msg ? JSON.parse(JSON.stringify(msg)) : null;
  }

  async findByClientMessageId(conversationId: string, clientMessageId: string): Promise<MessageDoc | null> {
    const msg = db.getMessageByClientMessageId(conversationId, clientMessageId);
    return msg ? JSON.parse(JSON.stringify(msg)) : null;
  }

  async getMessages(conversationId: string, options: CursorPaginationOptions = {}): Promise<{
    messages: MessageDoc[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(Math.max(options.limit || 30, 1), 100);

    // Retrieve pre-indexed chronologically sorted messages in O(1)
    const convMessages = db.getMessagesForConversation(conversationId);

    let endIndex = convMessages.length;

    if (options.cursor) {
      const cursorIdx = convMessages.findIndex(m => m._id === options.cursor);
      if (cursorIdx !== -1) {
        endIndex = cursorIdx;
      }
    }

    const startIndex = Math.max(0, endIndex - limit);
    const slice = convMessages.slice(startIndex, endIndex);

    const hasMore = startIndex > 0;
    const nextCursor = hasMore && slice.length > 0 ? slice[0]._id : null;

    return {
      messages: slice.map(m => JSON.parse(JSON.stringify(m))),
      nextCursor,
      hasMore,
    };
  }

  async create(data: Omit<MessageDoc, '_id' | 'createdAt' | 'updatedAt'>): Promise<MessageDoc> {
    const now = new Date().toISOString();
    const newMsg: MessageDoc = {
      ...data,
      _id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    db.messages.push(newMsg);
    db.addMessageToIndex(newMsg);
    db.scheduleSave();
    return JSON.parse(JSON.stringify(newMsg));
  }

  async update(id: string, updates: Partial<MessageDoc>): Promise<MessageDoc | null> {
    const index = db.messages.findIndex(m => m._id === id);
    if (index === -1) return null;

    db.messages[index] = {
      ...db.messages[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    db.addMessageToIndex(db.messages[index]);
    db.scheduleSave();
    return JSON.parse(JSON.stringify(db.messages[index]));
  }

  async softDelete(id: string): Promise<MessageDoc | null> {
    const index = db.messages.findIndex(m => m._id === id);
    if (index === -1) return null;

    db.messages[index] = {
      ...db.messages[index],
      text: 'This message was deleted',
      attachments: [],
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.addMessageToIndex(db.messages[index]);
    db.scheduleSave();
    return JSON.parse(JSON.stringify(db.messages[index]));
  }

  async updateReceipt(
    messageId: string,
    userId: string,
    status: 'delivered' | 'read'
  ): Promise<MessageDoc | null> {
    const msg = db.getMessageById(messageId);
    if (!msg) return null;

    const existingIndex = msg.receipts.findIndex(r => r.userId === userId);
    const now = new Date().toISOString();

    if (existingIndex !== -1) {
      // Don't downgrade 'read' to 'delivered'
      if (msg.receipts[existingIndex].status === 'read' && status === 'delivered') {
        return JSON.parse(JSON.stringify(msg));
      }
      msg.receipts[existingIndex].status = status;
      msg.receipts[existingIndex].updatedAt = now;
    } else {
      msg.receipts.push({ userId, status, updatedAt: now });
    }

    msg.updatedAt = now;
    db.scheduleSave();
    return JSON.parse(JSON.stringify(msg));
  }

  async markAllReadInConversation(
    conversationId: string,
    userId: string,
    upToMessageId?: string
  ): Promise<string[]> {
    const updatedMessageIds: string[] = [];
    const now = new Date().toISOString();
    const convMessages = db.getMessagesForConversation(conversationId);

    for (const msg of convMessages) {
      // Do not mark receipts on user's own sent messages
      if (msg.senderId === userId) continue;

      const receipt = msg.receipts.find(r => r.userId === userId);
      if (!receipt || receipt.status !== 'read') {
        if (receipt) {
          receipt.status = 'read';
          receipt.updatedAt = now;
        } else {
          msg.receipts.push({ userId, status: 'read', updatedAt: now });
        }
        updatedMessageIds.push(msg._id);
      }

      if (upToMessageId && msg._id === upToMessageId) {
        break;
      }
    }

    if (updatedMessageIds.length > 0) {
      db.scheduleSave();
    }

    return updatedMessageIds;
  }

  async markDeliveredToUser(conversationId: string, userId: string): Promise<string[]> {
    const updatedMessageIds: string[] = [];
    const now = new Date().toISOString();
    const convMessages = db.getMessagesForConversation(conversationId);

    for (const msg of convMessages) {
      if (msg.senderId === userId) continue;

      const receipt = msg.receipts.find(r => r.userId === userId);
      if (!receipt) {
        msg.receipts.push({ userId, status: 'delivered', updatedAt: now });
        updatedMessageIds.push(msg._id);
      }
    }

    if (updatedMessageIds.length > 0) {
      db.scheduleSave();
    }
    return updatedMessageIds;
  }

  async searchMessages(conversationId: string, query: string): Promise<MessageDoc[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    return db.messages
      .filter(m => m.conversationId === conversationId && !m.deletedAt && m.text.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(m => JSON.parse(JSON.stringify(m)));
  }

  async countUnreadForUser(conversationId: string, userId: string): Promise<number> {
    return db.messages.filter(m => {
      if (m.conversationId !== conversationId) return false;
      if (m.senderId === userId) return false;
      const receipt = m.receipts.find(r => r.userId === userId);
      return !receipt || receipt.status !== 'read';
    }).length;
  }
}

export const messageRepository = new MessageRepository();
