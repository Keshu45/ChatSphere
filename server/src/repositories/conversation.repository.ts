import { db, ConversationDoc } from '../db/storage';

export class ConversationRepository {
  async findById(id: string): Promise<ConversationDoc | null> {
    const conv = db.getConversationById(id);
    return conv ? JSON.parse(JSON.stringify(conv)) : null;
  }

  async findDirectBetween(userId1: string, userId2: string): Promise<ConversationDoc | null> {
    const conv = db.getDirectConversation(userId1, userId2);
    return conv ? JSON.parse(JSON.stringify(conv)) : null;
  }

  async findForUser(userId: string): Promise<ConversationDoc[]> {
    const list = db.getConversationsForUser(userId);
    // Sort by latest message or updated time descending
    return list.sort((a, b) => {
      const timeA = a.lastMessage?.createdAt || a.updatedAt;
      const timeB = b.lastMessage?.createdAt || b.updatedAt;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    }).map(c => JSON.parse(JSON.stringify(c)));
  }

  async create(data: Omit<ConversationDoc, '_id' | 'createdAt' | 'updatedAt'>): Promise<ConversationDoc> {
    const now = new Date().toISOString();
    const newConv: ConversationDoc = {
      ...data,
      _id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    db.conversations.push(newConv);
    db.addConversationToIndex(newConv);
    db.scheduleSave();
    return JSON.parse(JSON.stringify(newConv));
  }

  async update(id: string, updates: Partial<ConversationDoc>): Promise<ConversationDoc | null> {
    const index = db.conversations.findIndex(c => c._id === id);
    if (index === -1) return null;

    db.conversations[index] = {
      ...db.conversations[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    db.addConversationToIndex(db.conversations[index]);
    db.scheduleSave();
    return JSON.parse(JSON.stringify(db.conversations[index]));
  }

  async updateLastMessage(
    id: string,
    lastMessage: ConversationDoc['lastMessage']
  ): Promise<void> {
    const conv = db.conversations.find(c => c._id === id);
    if (conv) {
      conv.lastMessage = lastMessage;
      conv.updatedAt = new Date().toISOString();
      db.scheduleSave();
    }
  }

  async addMember(convId: string, member: ConversationDoc['members'][0]): Promise<ConversationDoc | null> {
    const conv = db.conversations.find(c => c._id === convId);
    if (!conv) return null;

    if (!conv.members.some(m => m.userId === member.userId)) {
      conv.members.push(member);
      conv.updatedAt = new Date().toISOString();
      db.scheduleSave();
    }
    return JSON.parse(JSON.stringify(conv));
  }

  async removeMember(convId: string, userId: string): Promise<ConversationDoc | null> {
    const conv = db.conversations.find(c => c._id === convId);
    if (!conv) return null;

    conv.members = conv.members.filter(m => m.userId !== userId);
    conv.updatedAt = new Date().toISOString();
    db.scheduleSave();
    return JSON.parse(JSON.stringify(conv));
  }

  async updateMemberRole(convId: string, userId: string, role: 'admin' | 'member'): Promise<ConversationDoc | null> {
    const conv = db.conversations.find(c => c._id === convId);
    if (!conv) return null;

    const member = conv.members.find(m => m.userId === userId);
    if (member) {
      member.role = role;
      conv.updatedAt = new Date().toISOString();
      db.scheduleSave();
    }
    return JSON.parse(JSON.stringify(conv));
  }

  async updateMemberRead(convId: string, userId: string, messageId: string): Promise<void> {
    const conv = db.conversations.find(c => c._id === convId);
    if (!conv) return;

    const member = conv.members.find(m => m.userId === userId);
    if (member) {
      member.lastReadMessageId = messageId;
      member.lastReadAt = new Date().toISOString();
      db.scheduleSave();
    }
  }
}

export const conversationRepository = new ConversationRepository();
