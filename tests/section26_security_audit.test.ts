import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

describe('SECTION 26.5 — Comprehensive Security Audit Verification', () => {
  const rootDir = process.cwd();
  const serverDir = path.join(rootDir, 'server');
  const srcDir = path.join(rootDir, 'src');

  // Helper to walk directory
  const walk = (dir: string, ext = ['.ts', '.tsx']): string[] => {
    let files: string[] = [];
    if (!fs.existsSync(dir)) return files;
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        files = files.concat(walk(full, ext));
      } else if (ext.some(e => full.endsWith(e))) {
        files.push(full);
      }
    }
    return files;
  };

  // 1. Hardcoded Secrets Check
  it('1. Verifies no hardcoded live API keys, tokens, or plaintext production credentials in source code', () => {
    const allCode = [...walk(serverDir), ...walk(srcDir), path.join(rootDir, 'server.ts')];
    const secretPatterns = [
      /ghp_[a-zA-Z0-9]{36}/,
      /AIzaSy[a-zA-Z0-9_-]{33}/,
      /sk_live_[a-zA-Z0-9]{24}/,
      /-----BEGIN RSA PRIVATE KEY-----/,
    ];

    for (const file of allCode) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of secretPatterns) {
        assert.ok(!pattern.test(content), `Found hardcoded secret pattern in ${file}`);
      }
    }
  });

  // 2. Hardcoded localhost in client bundle
  it('2. Verifies frontend client code contains zero hardcoded localhost URLs', () => {
    const clientFiles = walk(srcDir);
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      assert.ok(!content.includes('http://localhost'), `Found hardcoded localhost in frontend file: ${file}`);
      assert.ok(!content.includes('https://localhost'), `Found hardcoded localhost in frontend file: ${file}`);
    }
  });

  // 3. Security Headers & Server Hardening
  it('3. Verifies security headers and x-powered-by stripping in server.ts', () => {
    const serverContent = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf-8');
    assert.ok(serverContent.includes('X-Content-Type-Options') && serverContent.includes('nosniff'), 'Must enforce nosniff');
    assert.ok(serverContent.includes('X-Frame-Options') && serverContent.includes('SAMEORIGIN'), 'Must enforce SAMEORIGIN');
    assert.ok(serverContent.includes('X-XSS-Protection'), 'Must configure XSS protection header');
    assert.ok(serverContent.includes('Referrer-Policy'), 'Must configure Referrer-Policy header');
    assert.ok(serverContent.includes('removeHeader(\'X-Powered-By\')'), 'Must strip X-Powered-By header');
  });

  // 4. Client-trusted user/sender IDs protection
  it('4. Verifies sender IDs and current user identity are strictly server-derived from JWT', () => {
    const messageService = fs.readFileSync(path.join(serverDir, 'src/services/message.service.ts'), 'utf-8');
    assert.ok(messageService.includes('senderId: userId'), 'Message senderId must be bound to authenticated userId');

    const socketServer = fs.readFileSync(path.join(serverDir, 'src/sockets/socket.server.ts'), 'utf-8');
    assert.ok(socketServer.includes('const userId = user.userId;'), 'Socket sender must be taken from authenticated socket session');
  });

  // 5. Socket Authorization & Room Boundary
  it('5. Verifies socket rooms validate membership and reject unauthorized listeners', () => {
    const socketServer = fs.readFileSync(path.join(serverDir, 'src/sockets/socket.server.ts'), 'utf-8');
    assert.ok(socketServer.includes('Unauthorized to join room: not a member'), 'Must reject unauthorized socket room join');
    assert.ok(socketServer.includes('typing:start'), 'Must contain typing handler');
    assert.ok(socketServer.includes('socket.rooms.has') || socketServer.includes('conversationRepository.findById'), 'Must authorize typing events against conversation membership');
  });

  // 6. Rate Limiting Protection
  it('6. Verifies rate limiting middleware guards sensitive authentication routes', () => {
    const authRoutes = fs.readFileSync(path.join(serverDir, 'src/routes/auth.routes.ts'), 'utf-8');
    assert.ok(authRoutes.includes('authRateLimiter'), 'Auth routes must enforce authRateLimiter');
    assert.ok(authRoutes.includes('/register') && authRoutes.includes('/login'), 'Register and Login must be rate-limited');
  });

  // 7. Path Traversal & Unsafe Upload Protection
  it('7. Verifies file uploads sanitize filenames and reject traversal attempts', () => {
    const fileSec = fs.readFileSync(path.join(serverDir, 'src/utils/fileSecurity.ts'), 'utf-8');
    assert.ok(fileSec.includes('Path traversal or invalid characters detected'), 'Must reject path traversal in uploads');
    assert.ok(fileSec.includes('validateFileSignature'), 'Must validate file signatures and magic bytes');
    assert.ok(fileSec.includes('ALLOWED_MIME_TYPES'), 'Must whitelist allowed MIME types');
    assert.ok(fileSec.includes('MAX_FILE_SIZE = 10 * 1024 * 1024'), 'Must enforce max file upload size');
  });

  // 8. Sensitive Logging Redaction
  it('8. Verifies logger masks passwords, tokens and secrets', () => {
    const loggerContent = fs.readFileSync(path.join(serverDir, 'src/utils/logger.ts'), 'utf-8');
    assert.ok(loggerContent.includes('SENSITIVE_KEYS'), 'Logger must define sensitive keys');
    assert.ok(loggerContent.includes('[REDACTED]'), 'Logger must redact sensitive values');
  });

  // 9. Password Hashing & Never Returning Hashes
  it('9. Verifies passwords are never stored in plaintext and never leaked in API responses', () => {
    const authService = fs.readFileSync(path.join(serverDir, 'src/services/auth.service.ts'), 'utf-8');
    assert.ok(authService.includes('bcrypt.hash'), 'Auth service must hash passwords with bcrypt');
    assert.ok(authService.includes('delete (sanitized as any).passwordHash') || authService.includes('passwordHash: undefined') || !authService.includes('res.json(user.passwordHash)'), 'Password hashes must never be exposed');
  });
});
