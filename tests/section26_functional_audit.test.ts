import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { authService } from '../server/src/services/auth.service';
import { conversationService } from '../server/src/services/conversation.service';
import { messageService } from '../server/src/services/message.service';
import { userService } from '../server/src/services/user.service';
import { presenceService } from '../server/src/services/presence.service';
import { createSignedDownloadToken, verifySignedDownloadToken, sanitizeFilename } from '../server/src/utils/fileSecurity';

describe('SECTION 26.6 — Comprehensive Functional Audit Verification', () => {
  let userA: any;
  let userB: any;
  let directConv: any;
  let groupConv: any;
  let sentMsg: any;

  before(async () => {
    // Seed test users
    const rand = Date.now();
    userA = await authService.register(`fn_a_${rand}`, `fn_a_${rand}@example.com`, 'TestPassword123!');
    userB = await authService.register(`fn_b_${rand}`, `fn_b_${rand}@example.com`, 'TestPassword123!');
  });

  // 1. Authentication Lifecycle
  it('1. Registration, Login, and Auth Token persistence', async () => {
    assert.ok(userA.token, 'Registration must return a valid token');
    assert.ok(userA.user.id, 'Registration must return user document with ID');

    // Login with username
    const loginRes = await authService.login(userA.user.username, 'TestPassword123!');
    assert.equal(loginRes.user.id, userA.user.id, 'Login must succeed with valid credentials');
    assert.ok(loginRes.token, 'Login must yield JWT token');

    // Password validation rejects wrong password
    await assert.rejects(async () => {
      await authService.login(userA.user.username, 'WrongPassword!');
    });
  });

  // 2. Protected User API & Profile inspection
  it('2. Protected user profile inspection and modification', async () => {
    const me = await authService.getMe(userA.user.id);
    assert.equal(me.username, userA.user.username, 'getMe must retrieve current authenticated user');

    const updated = await userService.updateProfile(userA.user.id, {
      bio: 'Audited profile bio',
      soundEnabled: false,
    });
    assert.equal(updated.bio, 'Audited profile bio');
    assert.equal(updated.soundEnabled, false);
  });

  // 3. Direct Conversation Creation & Deduplication
  it('3. Direct chat creation, idempotency and privacy', async () => {
    directConv = await conversationService.getOrCreateDirectConversation(userA.user.id, userB.user.id);
    assert.ok(directConv.id, 'Direct conversation must be created');
    assert.equal(directConv.type, 'direct');
    assert.equal(directConv.members.length, 2);

    // Repeated call reuses same conversation
    const directConvDup = await conversationService.getOrCreateDirectConversation(userB.user.id, userA.user.id);
    assert.equal(directConvDup.id, directConv.id, 'Direct chat between same pair must be idempotent');

    // Disallow self-chat
    await assert.rejects(async () => {
      await conversationService.getOrCreateDirectConversation(userA.user.id, userA.user.id);
    });
  });

  // 4. Group Conversation Creation & Member Management
  it('4. Group chat creation, member addition, and role enforcement', async () => {
    groupConv = await conversationService.createGroupConversation(
      userA.user.id,
      'Audit Squad',
      'Quality assurance channel',
      [userB.user.id]
    );

    assert.equal(groupConv.type, 'group');
    assert.equal(groupConv.name, 'Audit Squad');
    assert.equal(groupConv.members.length, 2);

    const adminMember = groupConv.members.find((m: any) => m.userId === userA.user.id);
    assert.equal(adminMember?.role, 'admin', 'Creator must be assigned admin role');

    // Non-member access block
    await assert.rejects(async () => {
      await conversationService.getConversationById(groupConv.id, 'non-existent-user-id');
    });
  });

  // 5. Message Sending, History & Cursor Pagination
  it('5. Message persistence, delivery receipts, and cursor pagination', async () => {
    // Send message with idempotency key
    const clientMessageId = `cid_${Date.now()}`;
    sentMsg = await messageService.sendMessage(userA.user.id, directConv.id, {
      text: 'Functional audit message 1',
      clientMessageId,
    });

    assert.ok(sentMsg.id, 'Message must be assigned ID');
    assert.equal(sentMsg.text, 'Functional audit message 1');
    assert.equal(sentMsg.status, 'sent');

    // Idempotent retry returns original message
    const retryMsg = await messageService.sendMessage(userA.user.id, directConv.id, {
      text: 'Functional audit message 1',
      clientMessageId,
    });
    assert.equal(retryMsg.id, sentMsg.id, 'Sending duplicate clientMessageId must return original message');

    // Send second message
    const msg2 = await messageService.sendMessage(userA.user.id, directConv.id, {
      text: 'Functional audit message 2',
    });

    // Test cursor pagination
    const page1 = await messageService.getMessages(userA.user.id, directConv.id, { limit: 1 });
    assert.equal(page1.messages.length, 1);
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextCursor);

    // Delivery & Read Receipts
    await messageService.markMessageDelivered(userB.user.id, directConv.id, sentMsg.id);
    const readIds = await messageService.markConversationRead(userB.user.id, directConv.id, msg2.id);
    assert.ok(readIds.length > 0, 'Marking conversation read must update unread messages');
  });

  // 6. Message Edit, Delete (Soft-Delete) & Reply
  it('6. Message edit, soft-deletion, and thread replies', async () => {
    // Reply
    const replyMsg = await messageService.sendMessage(userB.user.id, directConv.id, {
      text: 'Replying to audit message',
      replyToId: sentMsg.id,
    });
    assert.equal(replyMsg.replyTo?.id, sentMsg.id, 'Reply message must link to parent');

    // Edit
    const editedMsg = await messageService.editMessage(userB.user.id, replyMsg.id, 'Edited reply text');
    assert.equal(editedMsg.text, 'Edited reply text');
    assert.ok(editedMsg.editedAt);

    // Soft delete
    const deletedMsg = await messageService.deleteMessage(userB.user.id, replyMsg.id);
    assert.ok(deletedMsg.deletedAt);
    assert.equal(deletedMsg.text, 'This message was deleted');

    // Prohibit unauthorized edit
    await assert.rejects(async () => {
      await messageService.editMessage(userA.user.id, replyMsg.id, 'Malicious edit attempt');
    });
  });

  // 7. Search Functionality
  it('7. User discovery and message content search', async () => {
    const userSearch = await userService.searchUsers(userB.user.username.slice(0, 4), userA.user.id);
    assert.ok(userSearch.some(u => u.id === userB.user.id), 'User search must locate registered users');

    const msgSearch = await messageService.searchMessages(userA.user.id, directConv.id, 'audit message 1');
    assert.ok(msgSearch.length > 0, 'Message search must return matched query within conversation');
  });

  // 8. Presence System
  it('8. Real-time multi-socket presence tracking', () => {
    const s1 = `sock_1_${Date.now()}`;
    const s2 = `sock_2_${Date.now()}`;

    // First connection marks user online
    const conn1 = presenceService.userConnected(userA.user.id, s1);
    assert.equal(conn1.isFirstConnection, true);
    assert.equal(presenceService.isUserOnline(userA.user.id), true);

    // Second device connection
    const conn2 = presenceService.userConnected(userA.user.id, s2);
    assert.equal(conn2.isFirstConnection, false);
    assert.equal(presenceService.isUserOnline(userA.user.id), true);

    // First device disconnects, user stays online
    const disc1 = presenceService.userDisconnected(s1);
    assert.equal(disc1.isLastConnection, false);
    assert.equal(presenceService.isUserOnline(userA.user.id), true);

    // Last device disconnects, user transitions offline
    const disc2 = presenceService.userDisconnected(s2);
    assert.equal(disc2.isLastConnection, true);
    assert.equal(presenceService.isUserOnline(userA.user.id), false);
  });

  // 9. File Security & Attachment Verification
  it('9. File security: sanitization, signed token validation, and path traversal rejection', () => {
    // Sanitization
    const safe = sanitizeFilename('my_document.pdf');
    assert.equal(safe.extension, '.pdf');

    // Rejection of traversal
    assert.throws(() => sanitizeFilename('../../etc/passwd'));

    // Signed URLs and tokens
    const { token } = createSignedDownloadToken('audit_file_123', userA.user.id, 3600);
    assert.ok(token, 'Signed token must exist');

    const verified = verifySignedDownloadToken(token, 'audit_file_123');
    assert.equal(verified.userId, userA.user.id);

    // Tampered token fails
    assert.throws(() => verifySignedDownloadToken('invalid.token', 'audit_file_123'));
    assert.throws(() => verifySignedDownloadToken(token, 'different_attachment_id'));
  });
});
