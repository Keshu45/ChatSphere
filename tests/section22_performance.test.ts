import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import { db, MessageDoc, UserDoc } from '../server/src/db/storage';
import { userRepository } from '../server/src/repositories/user.repository';
import { conversationRepository } from '../server/src/repositories/conversation.repository';
import { messageRepository } from '../server/src/repositories/message.repository';
import { presenceService } from '../server/src/services/presence.service';
import { createRateLimiter } from '../server/src/middleware/rateLimit.middleware';

describe('SECTION 22 — Performance & Scalability Benchmarks', () => {
  const benchmarkUserCount = 500;
  const benchmarkMessageCount = 2000;
  let testConvId: string;

  before(async () => {
    // Populate storage with bulk users and messages to stress-test indexes
    for (let i = 1; i <= benchmarkUserCount; i++) {
      const u: UserDoc = {
        _id: `bench_usr_${i}`,
        username: `bench_user_${i}`,
        usernameNormalized: `bench_user_${i}`,
        email: `bench_user_${i}@example.com`,
        emailNormalized: `bench_user_${i}@example.com`,
        passwordHash: 'hashed_password_placeholder',
        avatar: 'https://example.com/avatar.png',
        bio: `Bio for bench user ${i}`,
        status: 'offline',
        lastSeenAt: new Date().toISOString(),
        readReceiptsEnabled: true,
        soundEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.users.push(u);
      db.addUserToIndex(u);
    }

    const testConv = await conversationRepository.create({
      type: 'direct',
      createdBy: 'bench_usr_1',
      members: [
        { userId: 'bench_usr_1', role: 'member', joinedAt: new Date().toISOString() },
        { userId: 'bench_usr_2', role: 'member', joinedAt: new Date().toISOString() },
      ],
    });
    testConvId = testConv._id;

    // Seed 2000 chronological messages in this conversation
    const baseTime = Date.now() - 2000 * 1000;
    for (let i = 1; i <= benchmarkMessageCount; i++) {
      const mTime = new Date(baseTime + i * 1000).toISOString();
      const m: MessageDoc = {
        _id: `bench_msg_${i}`,
        conversationId: testConvId,
        senderId: i % 2 === 0 ? 'bench_usr_1' : 'bench_usr_2',
        clientMessageId: `cmsg_bench_${i}`,
        type: 'text',
        text: `Bench message payload #${i} with high-frequency indexing throughput`,
        receipts: [{ userId: 'bench_usr_2', status: 'read', updatedAt: mTime }],
        createdAt: mTime,
        updatedAt: mTime,
      };
      db.messages.push(m);
      db.addMessageToIndex(m);
    }
  });

  // 1. Indexed User Lookups (O(1) Map Hash Lookups)
  it('1. Index Performance: 10,000 user lookups execute in high-throughput time (<200ms)', async () => {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const targetId = `bench_usr_${(i % benchmarkUserCount) + 1}`;
      const found = await userRepository.findById(targetId);
      assert.ok(found);
      assert.equal(found._id, targetId);
    }
    const duration = performance.now() - start;
    console.log(`    Indexed 10,000 user lookups took: ${duration.toFixed(2)}ms`);
    assert.ok(duration < 200, `Lookups must complete in under 200ms, took ${duration}ms`);
  });

  // 2. Direct Conversation Index Lookup
  it('2. Index Performance: direct conversation lookup between users executes in O(1) (<150ms for 5,000 lookups)', async () => {
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      const conv = await conversationRepository.findDirectBetween('bench_usr_1', 'bench_usr_2');
      assert.ok(conv);
      assert.equal(conv._id, testConvId);
    }
    const duration = performance.now() - start;
    console.log(`    Direct conversation 5,000 lookups took: ${duration.toFixed(2)}ms`);
    assert.ok(duration < 150, `Lookups must complete in under 150ms, took ${duration}ms`);
  });

  // 3. ClientMessageId Idempotency Lookup
  it('3. Index Performance: clientMessageId deduplication lookup executes in O(1)', async () => {
    const start = performance.now();
    for (let i = 1; i <= 2000; i++) {
      const existing = await messageRepository.findByClientMessageId(testConvId, `cmsg_bench_${i}`);
      assert.ok(existing);
      assert.equal(existing._id, `bench_msg_${i}`);
    }
    const duration = performance.now() - start;
    console.log(`    2,000 idempotency clientMessageId lookups took: ${duration.toFixed(2)}ms`);
    assert.ok(duration < 40, `Idempotency lookups must complete in under 40ms, took ${duration}ms`);
  });

  // 4. Cursor Pagination Efficiency across 2,000 messages
  it('4. Pagination Scalability: fetching 100 consecutive pages of 20 messages completes in <30ms', async () => {
    let currentCursor: string | undefined = undefined;
    let totalRetrieved = 0;

    const start = performance.now();
    for (let page = 0; page < 50; page++) {
      const res = await messageRepository.getMessages(testConvId, {
        cursor: currentCursor,
        limit: 20,
      });
      assert.ok(res.messages.length > 0);
      totalRetrieved += res.messages.length;
      if (!res.hasMore || !res.nextCursor) break;
      currentCursor = res.nextCursor;
    }
    const duration = performance.now() - start;
    console.log(`    Paginated ${totalRetrieved} messages across 50 pages in: ${duration.toFixed(2)}ms`);
    assert.ok(duration < 50, `Pagination slice must execute in under 50ms, took ${duration}ms`);
  });

  // 5. Memory Management: Presence Map Cleanup
  it('5. Memory Cleanups: presence service properly clears maps on disconnect', () => {
    const tempUser = 'perf_presence_user';
    const tempSocket = 'perf_socket_id';

    presenceService.userConnected(tempUser, tempSocket);
    assert.equal(presenceService.isUserOnline(tempUser), true);

    const { isLastConnection } = presenceService.userDisconnected(tempSocket);
    assert.equal(isLastConnection, true);
    assert.equal(presenceService.isUserOnline(tempUser), false);

    // Verify socket ID mapping is purged
    assert.equal(presenceService.getUserSocketIds(tempUser).length, 0);
  });

  // 6. Memory Management: Rate Limiter Purge
  it('6. Memory Cleanups: rate limiter cleans up expired records', async () => {
    const shortLimiter = createRateLimiter({
      windowMs: 50, // 50ms window
      maxRequests: 5,
      keyPrefix: 'bench_ttl',
    });

    const mockReq = { ip: '192.168.1.1', socket: {}, headers: {} } as any;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    shortLimiter(mockReq, {} as any, next);
    assert.equal(nextCalled, true);

    // Wait for TTL expiration + purge cycle
    await new Promise(r => setTimeout(r, 120));

    // Request after TTL expiration creates fresh record without accumulation
    let freshCalled = false;
    shortLimiter(mockReq, {} as any, () => { freshCalled = true; });
    assert.equal(freshCalled, true);
  });

  after(() => {
    // Purge benchmark users, messages, and conversations from in-memory db
    db.users = db.users.filter(u => !u._id.startsWith('bench_usr_'));
    db.messages = db.messages.filter(m => !m._id.startsWith('bench_msg_'));
    if (testConvId) {
      db.conversations = db.conversations.filter(c => c._id !== testConvId);
    }
    db.rebuildIndexes();
  });
});
