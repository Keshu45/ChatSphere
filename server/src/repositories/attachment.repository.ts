import { db, AttachmentDoc } from '../db/storage';

export class AttachmentRepository {
  async findById(id: string): Promise<AttachmentDoc | null> {
    const att = db.getAttachmentById(id) || db.attachments.find(a => a._id === id);
    return att ? { ...att } : null;
  }

  async findByStorageKey(storageKey: string): Promise<AttachmentDoc | null> {
    const att = db.attachments.find(a => a.storageKey === storageKey);
    return att ? { ...att } : null;
  }

  async create(data: Omit<AttachmentDoc, '_id' | 'createdAt'>): Promise<AttachmentDoc> {
    const newAtt: AttachmentDoc = {
      ...data,
      _id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    db.attachments.push(newAtt);
    db.addAttachmentToIndex(newAtt);
    db.scheduleSave();
    return { ...newAtt };
  }

  async update(id: string, updates: Partial<AttachmentDoc>): Promise<AttachmentDoc | null> {
    const att = db.attachments.find(a => a._id === id);
    if (!att) return null;
    Object.assign(att, updates);
    db.addAttachmentToIndex(att);
    db.scheduleSave();
    return { ...att };
  }

  async isUserAuthorized(attachmentId: string, userId: string): Promise<boolean> {
    const att = await this.findById(attachmentId);
    if (!att) return false;

    // 1. Direct uploader is always authorized
    if (att.uploaderId === userId) {
      return true;
    }

    // 2. Check if attachment is associated with any message in a conversation the user belongs to
    for (const msg of db.messages) {
      if (msg.attachments && msg.attachments.some(a => a.id === attachmentId)) {
        const conv = db.getConversationById(msg.conversationId);
        if (conv && conv.members.some(m => m.userId === userId)) {
          return true;
        }
      }
    }

    return false;
  }
}

export const attachmentRepository = new AttachmentRepository();

