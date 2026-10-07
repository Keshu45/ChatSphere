import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { AuthService } from '../server/src/services/auth.service';
import { UserService } from '../server/src/services/user.service';
import { ConversationService } from '../server/src/services/conversation.service';
import { MessageService } from '../server/src/services/message.service';
import { presenceService } from '../server/src/services/presence.service';
import { userRepository } from '../server/src/repositories/user.repository';
import { conversationRepository } from '../server/src/repositories/conversation.repository';
import { messageRepository } from '../server/src/repositories/message.repository';
import { ValidationError, AuthenticationError, ForbiddenError } from '../server/src/utils/errors';

describe('20.1 Unit Tests', () => {
  const authService = new AuthService();
  const userService = new UserService();
  const conversationService = new ConversationService();
  const messageService = new MessageService();

  describe('Authentication & Password Validation', () => {
    it('validates password hashing and minimum length requirement', async () => {
      await assert.rejects(
        async () => authService.register('short_pwd_usr', 'short@example.com', '123'),
        (err: any) => err instanceof ValidationError && err.message.includes('Password must be at least 8 characters')
      );

      const username = `unit_user_${Date.now()}`;
      const email = `${username}@example.com`;
      const plainPassword = 'SuperSecretPassword123!';

      const result = await authService.register(username, email, plainPassword);
      assert.ok(result.user.id);
      assert.equal(result.user.username, username);
      assert.equal(result.user.email, email);

      // Verify passwordHash is never exposed in SafeUser
      assert.equal((result.user as any).passwordHash, undefined);

      // Verify password hash in repository is securely hashed with bcrypt
      const stored = await userRepository.findByUsername(username);
      assert.ok(stored);
      assert.notEqual(stored.passwordHash, plainPassword);
      const isMatch = await bcrypt.compare(plainPassword, stored.passwordHash);
      assert.equal(isMatch, true);
    });

    it('validates unique username and email normalization', async () => {
      const username = `unit_dup_${Date.now()}`;
      const email = `${username}@example.com`;

      await authService.register(username, email, 'StrongPass123!');

      // Duplicate email
      await assert.rejects(
        async () => authService.register(`${username}_2`, email, 'StrongPass123!'),
        (err: any) => err instanceof ValidationError && err.message.includes('already exists')
      );

      // Duplicate username
      await assert.rejects(
        async () => authService.register(username, `alt_${email}`, 'StrongPass123!'),
        (err: any) => err instanceof ValidationError && err.message.includes('already taken')
      );
    });

    it('rejects invalid login credentials with AuthenticationError', async () => {
      await assert.rejects(
        async () => authService.login('non_existent_user', 'anypassword'),
        (err: any) => err instanceof AuthenticationError && err.statusCode === 401
      );
    });
  });

  describe('Conversation Membership & Authorization', () => {
    it('prevents direct conversation creation with oneself', async () => {
      await assert.rejects(
        async () => conversationService.getOrCreateDirectConversation('usr_alex', 'usr_alex'),
        (err: any) => err.message.includes('Cannot start a direct conversation with yourself')
      );
    });

    it('ensures direct conversation between two users is reused without duplicate entries', async () => {
      const conv1 = await conversationService.getOrCreateDirectConversation('usr_alex', 'usr_sam');
      const conv2 = await conversationService.getOrCreateDirectConversation('usr_sam', 'usr_alex');
      assert.equal(conv1.id, conv2.id);
    });

    it('denies non-members from retrieving conversations', async () => {
      const conv = await conversationService.getOrCreateDirectConversation('usr_alex', 'usr_sam');
      await assert.rejects(
        async () => conversationService.getConversationById(conv.id, 'usr_unrelated'),
        (err: any) => err.message.includes('Forbidden: You are not a member')
      );
    });

    it('enforces admin-only permissions for group membership management', async () => {
      const group = await conversationService.createGroupConversation(
        'usr_alex',
        'Unit Test Admin Group',
        'Testing admin capabilities',
        ['usr_sam']
      );

      // Verify creator is assigned admin role
      const creatorMember = group.members.find(m => m.userId === 'usr_alex');
      assert.equal(creatorMember?.role, 'admin');

      // Non-admin (usr_sam) cannot add members
      await assert.rejects(
        async () => conversationService.addMembers(group.id, 'usr_sam', ['usr_elena']),
        (err: any) => err.message.includes('Only administrators can add group members')
      );

      // Admin (usr_alex) can add members
      const updated = await conversationService.addMembers(group.id, 'usr_alex', ['usr_elena']);
      assert.ok(updated.members.some(m => m.userId === 'usr_elena'));
    });
  });

  describe('Message Validation, Status Transitions, & Idempotency', () => {
    it('enforces idempotency using clientMessageId', async () => {
      const conv = await conversationService.getOrCreateDirectConversation('usr_alex', 'usr_sam');
      const clientMsgId = `cmsg_unit_${Date.now()}`;

      const msg1 = await messageService.sendMessage('usr_alex', conv.id, {
        text: 'Idempotency test payload',
        clientMessageId: clientMsgId,
      });

      // Send identical clientMessageId again
      const msg2 = await messageService.sendMessage('usr_alex', conv.id, {
        text: 'Idempotency test payload',
        clientMessageId: clientMsgId,
      });

      assert.equal(msg1.id, msg2.id);
      assert.equal(msg1.clientMessageId, msg2.clientMessageId);
    });

    it('tracks message status transitions from sent -> delivered -> read', async () => {
      const conv = await conversationService.getOrCreateDirectConversation('usr_alex', 'usr_sam');
      const msg = await messageService.sendMessage('usr_alex', conv.id, {
        text: 'Receipt transition test',
      });

      // Recipient (usr_sam) marks message as delivered
      const deliveredMsg = await messageService.markMessageDelivered('usr_sam', conv.id, msg.id);
      assert.ok(deliveredMsg);
      const deliveryReceipt = deliveredMsg.receipts.find(r => r.userId === 'usr_sam');
      assert.equal(deliveryReceipt?.status, 'delivered');

      // Recipient (usr_sam) opens conversation and marks message as read
      await messageService.markConversationRead('usr_sam', conv.id, msg.id);
      const readMsg = await messageRepository.findById(msg.id);
      assert.ok(readMsg);
      const readReceipt = readMsg.receipts.find(r => r.userId === 'usr_sam');
      assert.equal(readReceipt?.status, 'read');
    });

    it('prohibits editing messages by non-owners', async () => {
      const conv = await conversationService.getOrCreateDirectConversation('usr_alex', 'usr_sam');
      const msg = await messageService.sendMessage('usr_alex', conv.id, {
        text: 'Original alex message',
      });

      await assert.rejects(
        async () => messageService.editMessage('usr_sam', msg.id, 'Hacked text'),
        (err: any) => err.message.includes('Forbidden: You can only edit your own messages')
      );

      const edited = await messageService.editMessage('usr_alex', msg.id, 'Properly updated text');
      assert.equal(edited.text, 'Properly updated text');
      assert.ok(edited.editedAt);
    });

    it('performs soft-deletion preserving conversation consistency', async () => {
      const conv = await conversationService.getOrCreateDirectConversation('usr_alex', 'usr_sam');
      const msg = await messageService.sendMessage('usr_alex', conv.id, {
        text: 'Message to be soft deleted',
      });

      const deleted = await messageService.deleteMessage('usr_alex', msg.id);
      assert.equal(deleted.text, 'This message was deleted');
      assert.ok(deleted.deletedAt);

      // Verify cannot edit a deleted message
      await assert.rejects(
        async () => messageService.editMessage('usr_alex', msg.id, 'Revived text'),
        (err: any) => err.message.includes('Cannot edit a deleted message')
      );
    });
  });

  describe('Presence & Multi-Device Logic', () => {
    it('manages multiple active sockets per user and transitions state', () => {
      const userId = `multi_dev_${Date.now()}`;
      const sock1 = 'socket_tab_1';
      const sock2 = 'socket_tab_2';

      // First device connects
      const c1 = presenceService.userConnected(userId, sock1);
      assert.equal(c1.isFirstConnection, true);
      assert.equal(presenceService.isUserOnline(userId), true);

      // Second device connects for same user
      const c2 = presenceService.userConnected(userId, sock2);
      assert.equal(c2.isFirstConnection, false);
      assert.equal(presenceService.isUserOnline(userId), true);

      // First device disconnects -> user should still be online!
      const d1 = presenceService.userDisconnected(sock1);
      assert.equal(d1.isLastConnection, false);
      assert.equal(presenceService.isUserOnline(userId), true);

      // Second device disconnects -> user transitions to offline
      const d2 = presenceService.userDisconnected(sock2);
      assert.equal(d2.isLastConnection, true);
      assert.equal(presenceService.isUserOnline(userId), false);
    });
  });

  describe('Pagination Logic', () => {
    it('paginates conversation messages using cursor without skips or duplicates', async () => {
      const conv = await conversationService.getOrCreateDirectConversation('usr_alex', 'usr_sam');

      // Create 5 consecutive messages
      for (let i = 1; i <= 5; i++) {
        await messageService.sendMessage('usr_alex', conv.id, {
          text: `Pagination message ${i}`,
        });
      }

      // Page 1: limit 2
      const page1 = await messageService.getMessages('usr_alex', conv.id, { limit: 2 });
      assert.equal(page1.messages.length, 2);
      assert.ok(page1.hasMore);
      assert.ok(page1.nextCursor);

      // Page 2: with cursor
      const page2 = await messageService.getMessages('usr_alex', conv.id, {
        cursor: page1.nextCursor!,
        limit: 2,
      });
      assert.equal(page2.messages.length, 2);

      // Ensure zero overlap between page 1 and page 2
      const page1Ids = new Set(page1.messages.map(m => m.id));
      for (const m of page2.messages) {
        assert.equal(page1Ids.has(m.id), false);
      }
    });
  });
});
