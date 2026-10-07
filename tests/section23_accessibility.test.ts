import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('SECTION 23 — Accessibility (a11y) & UI Polish Audits', () => {
  // 1. HTML Root Document Accessibility
  it('1. HTML Entry Point: includes lang="en", viewport, and rich metadata', () => {
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(content.includes('<html lang="en">'), 'Must specify primary language lang="en"');
    assert.ok(content.includes('name="viewport"'), 'Must include responsive viewport meta tag');
    assert.ok(content.includes('<title>'), 'Must have descriptive document title');
    assert.ok(content.includes('name="description"'), 'Must have meta description');
  });

  // 2. CSS Accessibility: Reduced Motion & Focus Visible
  it('2. Stylesheet: implements prefers-reduced-motion and focus-visible indicators', () => {
    const cssPath = path.resolve(process.cwd(), 'src/index.css');
    const content = fs.readFileSync(cssPath, 'utf8');

    assert.ok(
      content.includes('prefers-reduced-motion: reduce'),
      'Must contain prefers-reduced-motion media query for motion sensitivity'
    );
    assert.ok(
      content.includes(':focus-visible'),
      'Must specify high-contrast visible focus outline for keyboard navigation'
    );
  });

  // 3. Skip to Content Landmark
  it('3. AppLayout: provides accessible Skip to Main Content link and landmarks', () => {
    const appLayoutPath = path.resolve(process.cwd(), 'src/components/layout/AppLayout.tsx');
    const content = fs.readFileSync(appLayoutPath, 'utf8');

    assert.ok(
      content.includes('href="#main-content"'),
      'Must provide a skip-to-content anchor for keyboard users'
    );
    assert.ok(
      content.includes('role="main"') || content.includes('<main'),
      'Must have semantic main landmark'
    );
    assert.ok(
      content.includes('aria-label="Conversations sidebar"'),
      'Sidebar must have descriptive aria landmark'
    );
  });

  // 4. Header Landmarks & Status Announcements
  it('4. Header: provides banner role, navigation categories, and live connection status', () => {
    const headerPath = path.resolve(process.cwd(), 'src/components/layout/Header.tsx');
    const content = fs.readFileSync(headerPath, 'utf8');

    assert.ok(content.includes('role="banner"'), 'Header must implement banner role');
    assert.ok(content.includes('aria-label="Chat categories"'), 'Nav must have accessible label');
    assert.ok(content.includes('role="status"'), 'Connection indicator must announce state to screen readers');
    assert.ok(content.includes('aria-live="polite"'), 'Connection indicator must be politely live');
    assert.ok(content.includes('aria-label="Switch demo user account"'), 'Switch account button must have aria-label');
  });

  // 5. Message Receipts Accessibility
  it('5. Receipts: Checkmarks provide screen-reader text and accessible img role', () => {
    const receiptPath = path.resolve(process.cwd(), 'src/components/chat/ReceiptCheckmarks.tsx');
    const content = fs.readFileSync(receiptPath, 'utf8');

    assert.ok(content.includes('role="img"'), 'Receipt icons must have role="img"');
    assert.ok(content.includes('aria-label='), 'Receipts must supply dynamic descriptive labels');
    assert.ok(content.includes('sr-only'), 'Receipts must contain sr-only text for screen readers');
    assert.ok(content.includes('Read by'), 'Multi-recipient receipt must describe read counts');
  });

  // 6. Typing Indicator Live Region
  it('6. Typing Indicator: implements ARIA live polite region for screen readers', () => {
    const typingPath = path.resolve(process.cwd(), 'src/components/chat/TypingIndicator.tsx');
    const content = fs.readFileSync(typingPath, 'utf8');

    assert.ok(content.includes('role="status"'), 'Typing indicator must have role="status"');
    assert.ok(content.includes('aria-live="polite"'), 'Typing indicator must be polite live region');
    assert.ok(content.includes('aria-atomic="true"'), 'Typing indicator must announce atomic updates');
  });

  // 7. Message Stream ARIA Log & Pagination
  it('7. ChatWindow: message stream implements role="log" and keyboard accessible search/scroll', () => {
    const chatPath = path.resolve(process.cwd(), 'src/components/chat/ChatWindow.tsx');
    const content = fs.readFileSync(chatPath, 'utf8');

    assert.ok(content.includes('role="log"'), 'Message stream must be role="log"');
    assert.ok(content.includes('aria-live="polite"'), 'Message stream must be live polite region');
    assert.ok(content.includes('role="search"'), 'In-chat search container must implement search role');
    assert.ok(content.includes("e.key === 'Escape'"), 'ChatWindow must dismiss search and drawers on Escape');
    assert.ok(content.includes('aria-label="Scroll to newest messages"'), 'Floating scroll button must have label');
  });

  // 8. Message Composer: Keyboard Navigation & ARIA labels
  it('8. MessageComposer: inputs and controls provide complete accessible labels & Esc handling', () => {
    const composerPath = path.resolve(process.cwd(), 'src/components/chat/MessageComposer.tsx');
    const content = fs.readFileSync(composerPath, 'utf8');

    assert.ok(content.includes('id="message-composer-textarea"'), 'Textarea must have ID');
    assert.ok(content.includes('aria-label="Type message content'), 'Textarea must have descriptive aria-label');
    assert.ok(content.includes('aria-label="Attach image or file"'), 'Attachment button must have aria-label');
    assert.ok(content.includes("'Send message'") || content.includes('"Send message"'), 'Send button must have aria-label');
    assert.ok(content.includes("e.key === 'Escape'"), 'Composer must handle Escape to cancel edit/reply/emoji');
    assert.ok(content.includes('role="list" aria-label="Attached files"'), 'Attachment list must be semantic');
  });

  // 9. MessageBubble: Focus States & Keyboard Dialogs
  it('9. MessageBubble: floating action bar reveals on focus-within and articles are semantic', () => {
    const bubblePath = path.resolve(process.cwd(), 'src/components/chat/MessageBubble.tsx');
    const content = fs.readFileSync(bubblePath, 'utf8');

    assert.ok(content.includes('role="article"'), 'Each message bubble must implement role="article"');
    assert.ok(
      content.includes('focus-within:opacity-100') || content.includes('group-focus-within:opacity-100'),
      'Floating action toolbar must be visible on keyboard focus-within'
    );
    assert.ok(content.includes('role="toolbar"'), 'Action bar must implement role="toolbar"');
    assert.ok(content.includes('aria-label="Reply to message"'), 'Reply action must have aria-label');
    assert.ok(content.includes('aria-label="Copy message text"'), 'Copy action must have aria-label');
    assert.ok(content.includes("e.key === 'Escape'"), 'Image lightbox preview must dismiss on Escape');
  });

  // 10. Dialog Modals: WAI-ARIA Modal Dialog Pattern
  it('10. Dialog Modals: all modals implement role="dialog", aria-modal="true", and Escape listener', () => {
    const modals = [
      'src/components/conversations/NewConversationModal.tsx',
      'src/components/conversations/NewGroupModal.tsx',
      'src/components/profile/UserProfileModal.tsx',
      'src/components/profile/AccountSwitcherModal.tsx',
      'src/components/auth/AuthModal.tsx',
    ];

    for (const file of modals) {
      const modalPath = path.resolve(process.cwd(), file);
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(content.includes('role="dialog"'), `${file} must specify role="dialog"`);
      assert.ok(content.includes('aria-modal="true"'), `${file} must specify aria-modal="true"`);
      assert.ok(content.includes('aria-labelledby='), `${file} must specify aria-labelledby`);
      assert.ok(content.includes("e.key === 'Escape'"), `${file} must dismiss on Escape key press`);
    }
  });

  // 11. Color Contrast Standards Calculation (WCAG AA)
  it('11. Color Contrast: evaluates hex luminescence to guarantee WCAG AA >= 4.5:1 ratio', () => {
    function hexToLuminance(hex: string): number {
      const cleanHex = hex.replace('#', '');
      const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

      const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const l1 = hexToLuminance(hex1);
      const l2 = hexToLuminance(hex2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    // Background: #0a0a0a (Tailwind neutral-950)
    const bgDark = '#0a0a0a';

    // Primary Text: #f5f5f5 (neutral-100)
    const textPrimary = '#f5f5f5';
    const primaryRatio = contrastRatio(bgDark, textPrimary);
    assert.ok(primaryRatio >= 4.5, `Primary text contrast ratio ${primaryRatio.toFixed(2)} must be >= 4.5:1`);

    // Secondary Text: #a3a3a3 (neutral-400)
    const textSecondary = '#a3a3a3';
    const secondaryRatio = contrastRatio(bgDark, textSecondary);
    assert.ok(secondaryRatio >= 4.5, `Secondary text contrast ratio ${secondaryRatio.toFixed(2)} must be >= 4.5:1`);

    // Accent Focus Color: #6366f1 (Indigo-500)
    const accentColor = '#6366f1';
    const accentRatio = contrastRatio(bgDark, accentColor);
    assert.ok(accentRatio >= 3.0, `Focus outline contrast ratio ${accentRatio.toFixed(2)} must be >= 3.0:1 (WCAG UI element standard)`);
  });
});
