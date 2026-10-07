import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

describe('Section 24: Frontend UI, Responsiveness, & Theme Audit Tests', () => {
  const srcDir = path.resolve(process.cwd(), 'src');

  // 1. Zero Window.alert / Window.open Violations
  it('1. Verifies zero window.alert calls in client source code', () => {
    const checkDir = (dir: string): string[] => {
      let files: string[] = [];
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          files = files.concat(checkDir(fullPath));
        } else if (item.isFile() && (item.name.endsWith('.tsx') || item.name.endsWith('.ts'))) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const allSrcFiles = checkDir(srcDir);
    const violations: { file: string; line: number }[] = [];

    for (const f of allSrcFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        // Look for alert( or window.alert(
        if (/\b(?:window\.)?alert\s*\(/.test(line)) {
          violations.push({ file: path.relative(process.cwd(), f), line: idx + 1 });
        }
      });
    }

    assert.equal(
      violations.length,
      0,
      `Found window.alert violations in: ${JSON.stringify(violations)}`
    );
  });

  // 2. Dark & Light Theme Implementation
  it('2. Verifies Dark & Light Mode ThemeContext and index.css integration', () => {
    const themeContextPath = path.join(srcDir, 'context', 'ThemeContext.tsx');
    assert.ok(fs.existsSync(themeContextPath), 'ThemeContext.tsx must exist');

    const themeContent = fs.readFileSync(themeContextPath, 'utf-8');
    assert.ok(themeContent.includes('chatsphere_theme'), 'Must persist theme to localStorage');
    assert.ok(themeContent.includes('classList.add'), 'Must toggle dark/light class on root element');
    assert.ok(themeContent.includes('toggleTheme'), 'Must provide toggleTheme helper');

    const cssPath = path.join(srcDir, 'index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    assert.ok(
      cssContent.includes('@custom-variant dark'),
      'index.css must declare custom dark variant'
    );

    const headerPath = path.join(srcDir, 'components', 'layout', 'Header.tsx');
    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    assert.ok(headerContent.includes('toggleTheme'), 'Header must provide theme toggle trigger');
    assert.ok(headerContent.includes('useTheme'), 'Header must consume useTheme');
  });

  // 3. Accessible Toast Notification System
  it('3. Verifies Accessible Toast Notification Context and feedback states', () => {
    const toastContextPath = path.join(srcDir, 'context', 'ToastContext.tsx');
    assert.ok(fs.existsSync(toastContextPath), 'ToastContext.tsx must exist');

    const toastContent = fs.readFileSync(toastContextPath, 'utf-8');
    assert.ok(toastContent.includes('role="alert"') || toastContent.includes("role={isError ? 'alert' : 'status'}"));
    assert.ok(toastContent.includes('aria-live="polite"'));
    assert.ok(toastContent.includes('dismissToast'));
    assert.ok(toastContent.includes('success'));
    assert.ok(toastContent.includes('error'));
  });

  // 4. Mobile Responsiveness Architecture
  it('4. Verifies Mobile full-screen navigation and back button architecture', () => {
    const appLayoutPath = path.join(srcDir, 'components', 'layout', 'AppLayout.tsx');
    const appLayoutContent = fs.readFileSync(appLayoutPath, 'utf-8');

    // Conversation list hidden on mobile when active conversation is present
    assert.ok(appLayoutContent.includes("activeConversation ? 'hidden md:flex' : 'flex'"));
    // Chat window hidden on mobile when no active conversation
    assert.ok(appLayoutContent.includes("!activeConversation ? 'hidden md:flex' : 'flex'"));

    // ChatWindow back mobile handler
    const chatWindowPath = path.join(srcDir, 'components', 'chat', 'ChatWindow.tsx');
    const chatWindowContent = fs.readFileSync(chatWindowPath, 'utf-8');
    assert.ok(chatWindowContent.includes('onBackMobile'));

    // ConversationHeader mobile back button with >= 44px touch target
    const headerPath = path.join(srcDir, 'components', 'chat', 'ConversationHeader.tsx');
    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    assert.ok(headerContent.includes('md:hidden'));
    assert.ok(headerContent.includes('min-w-[44px]') || headerContent.includes('min-h-[44px]'));
    assert.ok(headerContent.includes('Back to conversations list'));
  });

  // 5. Chat UI Elements: Date Separator, Unread Separator, Skeletons, Receipts
  it('5. Verifies required Chat UI elements: unread separator, skeletons, receipts, scroll-to-latest', () => {
    const chatWindowPath = path.join(srcDir, 'components', 'chat', 'ChatWindow.tsx');
    const chatWindowContent = fs.readFileSync(chatWindowPath, 'utf-8');

    // Date separator logic
    assert.ok(chatWindowContent.includes('renderMessagesWithDateSeparators'));
    // Unread Separator
    assert.ok(chatWindowContent.includes('Unread Messages'));
    assert.ok(chatWindowContent.includes('role="separator"'));
    // Loading skeleton
    assert.ok(chatWindowContent.includes('animate-pulse'));
    // Scroll-to-bottom button
    assert.ok(chatWindowContent.includes('showScrollBottom'));
    assert.ok(chatWindowContent.includes('scrollToBottom'));

    // Receipt Checkmarks
    const receiptsPath = path.join(srcDir, 'components', 'chat', 'ReceiptCheckmarks.tsx');
    const receiptsContent = fs.readFileSync(receiptsPath, 'utf-8');
    assert.ok(receiptsContent.includes('sending'));
    assert.ok(receiptsContent.includes('sent'));
    assert.ok(receiptsContent.includes('delivered'));
    assert.ok(receiptsContent.includes('read'));
  });

  // 6. Word-wrap & Viewport-Safe Attachments
  it('6. Verifies word-wrap protection and viewport-safe attachment constraints', () => {
    const bubblePath = path.join(srcDir, 'components', 'chat', 'MessageBubble.tsx');
    const bubbleContent = fs.readFileSync(bubblePath, 'utf-8');

    // Word break & overflow containment
    assert.ok(bubbleContent.includes('break-words'));
    assert.ok(bubbleContent.includes('whitespace-pre-wrap'));
    assert.ok(bubbleContent.includes('overflow-hidden'));

    // Attachment max-w-full constraint
    assert.ok(bubbleContent.includes('max-w-full'));
    assert.ok(bubbleContent.includes('max-h-60') || bubbleContent.includes('max-h-64') || bubbleContent.includes('max-h-72'));
  });

  // 7. Message Composer Responsiveness & Controls
  it('7. Verifies Message Composer controls: emoji, attachments, reply/edit, sticky mobile positioning', () => {
    const composerPath = path.join(srcDir, 'components', 'chat', 'MessageComposer.tsx');
    const composerContent = fs.readFileSync(composerPath, 'utf-8');

    assert.ok(composerContent.includes('COMMON_EMOJIS'));
    assert.ok(composerContent.includes('handleFileUpload'));
    assert.ok(composerContent.includes('replyingTo'));
    assert.ok(composerContent.includes('editingMessage'));
    assert.ok(composerContent.includes('removeAttachment'));
    assert.ok(composerContent.includes('shrink-0'));
  });

  // 8. Interactive Modals Accessibility & Small-Screen Fitness
  it('8. Verifies interactive modals fit small screens with max-h-[85vh/90vh] and ARIA dialog semantics', () => {
    const modals = [
      'src/components/conversations/NewConversationModal.tsx',
      'src/components/conversations/NewGroupModal.tsx',
      'src/components/profile/UserProfileModal.tsx',
      'src/components/profile/AccountSwitcherModal.tsx',
      'src/components/auth/AuthModal.tsx',
    ];

    for (const m of modals) {
      const modalContent = fs.readFileSync(path.resolve(process.cwd(), m), 'utf-8');
      assert.ok(modalContent.includes('role="dialog"'), `${m} must declare role="dialog"`);
      assert.ok(modalContent.includes('aria-modal="true"'), `${m} must declare aria-modal="true"`);
      assert.ok(modalContent.includes('Escape'), `${m} must handle Escape keyboard dismissal`);
      assert.ok(
        modalContent.includes('max-h-[85vh]') || modalContent.includes('max-h-[90vh]'),
        `${m} must limit modal height for mobile viewports`
      );
    }
  });
});
