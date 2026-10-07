import { conversationRepository } from '../repositories/conversation.repository';
import { userRepository } from '../repositories/user.repository';
import { messageRepository } from '../repositories/message.repository';
import { presenceService } from './presence.service';
import { authService } from './auth.service';
import { Conversation, SafeUser } from '../../../src/types/chat';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

export class ConversationService {
  async formatConversation(conv: any, currentUserId: string): Promise<Conversation> {
    let otherUser: SafeUser | undefined;
    let isOnline = false;

    if (conv.type === 'direct') {
      const otherMember = conv.members.find((m: any) => m.userId !== currentUserId);
      if (otherMember) {
        const u = await userRepository.findById(otherMember.userId);
        if (u) {
          otherUser = authService.toSafeUser(u);
          isOnline = presenceService.isUserOnline(u._id);
        }
      }
    }

    const unreadCount = await messageRepository.countUnreadForUser(conv._id, currentUserId);

    return {
      id: conv._id,
      type: conv.type,
      name: conv.name,
      description: conv.description,
      avatar: conv.avatar,
      createdBy: conv.createdBy,
      members: conv.members,
      lastMessage: conv.lastMessage,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      otherUser,
      unreadCount,
      isOnline,
    };
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    const list = await conversationRepository.findForUser(userId);
    const formatted = await Promise.all(
      list.map(c => this.formatConversation(c, userId))
    );
    return formatted;
  }

  async getConversationById(convId: string, userId: string): Promise<Conversation> {
    const conv = await conversationRepository.findById(convId);
    if (!conv) {
      throw new NotFoundError('Conversation not found');
    }

    const isMember = conv.members.some(m => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenError('Forbidden: You are not a member of this conversation');
    }

    return this.formatConversation(conv, userId);
  }

  async getOrCreateDirectConversation(userId: string, targetUserId: string): Promise<Conversation> {
    if (userId === targetUserId) {
      throw new ValidationError('Cannot start a direct conversation with yourself');
    }

    const targetUser = await userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('Target user does not exist');
    }

    let conv = await conversationRepository.findDirectBetween(userId, targetUserId);
    if (!conv) {
      const now = new Date().toISOString();
      conv = await conversationRepository.create({
        type: 'direct',
        createdBy: userId,
        members: [
          { userId, role: 'member', joinedAt: now },
          { userId: targetUserId, role: 'member', joinedAt: now },
        ],
      });
    }

    return this.formatConversation(conv, userId);
  }

  async createGroupConversation(
    userId: string,
    name: string,
    description: string,
    memberIds: string[]
  ): Promise<Conversation> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new ValidationError('Group name is required');
    }

    const now = new Date().toISOString();
    // Unique member list including creator
    const uniqueIds = Array.from(new Set([userId, ...memberIds]));

    const members = uniqueIds.map(mId => ({
      userId: mId,
      role: (mId === userId ? 'admin' : 'member') as 'admin' | 'member',
      joinedAt: now,
    }));

    const conv = await conversationRepository.create({
      type: 'group',
      name: cleanName,
      description: description.trim(),
      createdBy: userId,
      members,
    });

    return this.formatConversation(conv, userId);
  }

  async updateGroup(
    convId: string,
    userId: string,
    data: { name?: string; description?: string; avatar?: string }
  ): Promise<Conversation> {
    const conv = await conversationRepository.findById(convId);
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'group') throw new ValidationError('Not a group conversation');

    const member = conv.members.find(m => m.userId === userId);
    if (!member || member.role !== 'admin') {
      throw new ForbiddenError('Only group administrators can modify group details');
    }

    const updated = await conversationRepository.update(convId, {
      ...(data.name && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() }),
      ...(data.avatar !== undefined && { avatar: data.avatar }),
    });

    return this.formatConversation(updated, userId);
  }

  async addMembers(convId: string, userId: string, newMemberIds: string[]): Promise<Conversation> {
    const conv = await conversationRepository.findById(convId);
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'group') throw new ValidationError('Cannot add members to a direct message');

    const requester = conv.members.find(m => m.userId === userId);
    if (!requester || requester.role !== 'admin') {
      throw new ForbiddenError('Only administrators can add group members');
    }

    const now = new Date().toISOString();
    for (const newId of newMemberIds) {
      await conversationRepository.addMember(convId, {
        userId: newId,
        role: 'member',
        joinedAt: now,
      });
    }

    const updated = await conversationRepository.findById(convId);
    return this.formatConversation(updated, userId);
  }

  async removeMember(convId: string, userId: string, memberIdToRemove: string): Promise<Conversation> {
    const conv = await conversationRepository.findById(convId);
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'group') throw new ValidationError('Cannot remove members from a direct message');

    const requester = conv.members.find(m => m.userId === userId);
    if (!requester) throw new ForbiddenError('Not a member of this conversation');

    // Self-leaving is allowed, or admin removing someone else
    const isSelf = userId === memberIdToRemove;
    if (!isSelf && requester.role !== 'admin') {
      throw new ForbiddenError('Only administrators can remove other members');
    }

    await conversationRepository.removeMember(convId, memberIdToRemove);
    const updated = await conversationRepository.findById(convId);
    return this.formatConversation(updated, userId);
  }
}

export const conversationService = new ConversationService();
