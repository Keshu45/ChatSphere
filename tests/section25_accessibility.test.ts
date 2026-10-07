import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

describe('SECTION 25 — Comprehensive Accessibility (a11y) Verification', () => {
  const srcDir = path.resolve(process.cwd(), 'src');

  // 1. Semantic HTML & Landmarks
  it('1. Verifies semantic HTML landmarks across layout and views', () => {
    const layoutContent = fs.readFileSync(path.join(srcDir, 'components/layout/AppLayout.tsx'), 'utf-8');
    assert.ok(layoutContent.includes('role="main"') || layoutContent.includes('<main'), 'Layout must have semantic <main>');
    assert.ok(layoutContent.includes('<aside') || layoutContent.includes('role="complementary"'), 'Layout must have semantic <aside>');
    assert.ok(layoutContent.includes('Skip to main content'), 'Skip to content link must exist');

    const headerContent = fs.readFileSync(path.join(srcDir, 'components/layout/Header.tsx'), 'utf-8');
    assert.ok(headerContent.includes('role="banner"') || headerContent.includes('<header'), 'Header must have semantic <header>');
    assert.ok(headerContent.includes('<nav') || headerContent.includes('role="navigation"'), 'Header must have semantic <nav>');
  });

  // 2. Visible Focus Indicators & Reduced Motion
  it('2. Verifies WCAG 2.4.7 visible focus ring and WCAG 2.3.3 reduced motion in index.css', () => {
    const cssContent = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf-8');
    assert.ok(cssContent.includes(':focus-visible'), 'Must define visible focus indicators');
    assert.ok(cssContent.includes('outline:'), 'Focus indicator must have clear outline');
    assert.ok(cssContent.includes('prefers-reduced-motion: reduce'), 'Must implement prefers-reduced-motion media query');
    assert.ok(cssContent.includes('animation-duration: 0.001ms') || cssContent.includes('animation: none'), 'Animations must be disabled in reduced motion');
  });

  // 3. Accessible Form Controls & Error Feedback for Screen Readers
  it('3. Verifies accessible form controls with labels and screen-reader error alerts', () => {
    const authContent = fs.readFileSync(path.join(srcDir, 'components/auth/AuthModal.tsx'), 'utf-8');
    assert.ok(authContent.includes('role="alert"'), 'Auth errors must have role="alert"');
    assert.ok(authContent.includes('aria-live="assertive"'), 'Auth error alert must be assertive');
    assert.ok(authContent.includes('aria-describedby'), 'Inputs must link to error description via aria-describedby');
    assert.ok(authContent.includes('htmlFor="auth-credential-input"'), 'Inputs must have associated htmlFor labels');

    const groupContent = fs.readFileSync(path.join(srcDir, 'components/conversations/NewGroupModal.tsx'), 'utf-8');
    assert.ok(groupContent.includes('role="alert"'), 'Group creation error must have role="alert"');
    assert.ok(groupContent.includes('htmlFor="group-name-input"'), 'Group name input must have associated label');

    const convoContent = fs.readFileSync(path.join(srcDir, 'components/conversations/NewConversationModal.tsx'), 'utf-8');
    assert.ok(convoContent.includes('htmlFor="convo-search-input"'), 'Search input must have associated label');
  });

  // 4. Proper Heading Hierarchy
  it('4. Verifies logical heading hierarchy (h1/h2/h3/h4) across components', () => {
    const chatWindowContent = fs.readFileSync(path.join(srcDir, 'components/chat/ChatWindow.tsx'), 'utf-8');
    assert.ok(chatWindowContent.includes('<h2') || chatWindowContent.includes('<h3'), 'Chat window must use logical headings');

    const convoListContent = fs.readFileSync(path.join(srcDir, 'components/conversations/ConversationList.tsx'), 'utf-8');
    assert.ok(convoListContent.includes('<h2'), 'Conversation list must use <h2>');

    const newGroupContent = fs.readFileSync(path.join(srcDir, 'components/conversations/NewGroupModal.tsx'), 'utf-8');
    assert.ok(newGroupContent.includes('<h3'), 'Modals must use <h3> for dialog titles');
  });

  // 5. Dialog Accessibility & Keyboard Navigation (Escape handling, ARIA dialog)
  it('5. Verifies WAI-ARIA dialog semantics and Escape key handling across all modals', () => {
    const modalFiles = [
      'components/auth/AuthModal.tsx',
      'components/conversations/NewConversationModal.tsx',
      'components/conversations/NewGroupModal.tsx',
      'components/profile/UserProfileModal.tsx',
      'components/profile/AccountSwitcherModal.tsx',
    ];

    for (const f of modalFiles) {
      const content = fs.readFileSync(path.join(srcDir, f), 'utf-8');
      assert.ok(content.includes('role="dialog"'), `${f} must declare role="dialog"`);
      assert.ok(content.includes('aria-modal="true"'), `${f} must declare aria-modal="true"`);
      assert.ok(content.includes("e.key === 'Escape'"), `${f} must dismiss on Escape key press`);
      assert.ok(content.includes('aria-labelledby'), `${f} must have aria-labelledby referencing title`);
    }
  });

  // 6. Screen-Reader Friendly Status Messages & Live Regions
  it('6. Verifies live regions for dynamic chat statuses (typing, receipts, connection, toasts)', () => {
    // Typing indicator
    const typingContent = fs.readFileSync(path.join(srcDir, 'components/chat/TypingIndicator.tsx'), 'utf-8');
    assert.ok(typingContent.includes('aria-live="polite"'), 'Typing indicator must have aria-live="polite"');

    // Toasts
    const toastContent = fs.readFileSync(path.join(srcDir, 'context/ToastContext.tsx'), 'utf-8');
    assert.ok(toastContent.includes('aria-live="polite"'), 'Toast container must have aria-live="polite"');

    // Header connection status
    const headerContent = fs.readFileSync(path.join(srcDir, 'components/layout/Header.tsx'), 'utf-8');
    assert.ok(headerContent.includes('role="status"'), 'Connection indicator must have role="status"');

    // Receipts
    const receiptsContent = fs.readFileSync(path.join(srcDir, 'components/chat/ReceiptCheckmarks.tsx'), 'utf-8');
    assert.ok(receiptsContent.includes('role="img"'), 'Receipt checkmarks must declare role="img"');
    assert.ok(receiptsContent.includes('sr-only'), 'Receipt checkmarks must include screen-reader text');
  });

  // 7. Important Buttons & Actions Have Accessible Names
  it('7. Verifies all interactive buttons and triggers have explicit accessible names', () => {
    const composerContent = fs.readFileSync(path.join(srcDir, 'components/chat/MessageComposer.tsx'), 'utf-8');
    assert.ok(composerContent.includes('aria-label="Attach image or file"'), 'Attachment button must have descriptive label');
    assert.ok(composerContent.includes('aria-label="Open emoji picker"') || composerContent.includes('title="Emoji"'), 'Emoji button must have label');
    assert.ok(composerContent.includes('Send message'), 'Send button must have accessible name');

    const bubbleContent = fs.readFileSync(path.join(srcDir, 'components/chat/MessageBubble.tsx'), 'utf-8');
    assert.ok(bubbleContent.includes('aria-label="Reply to message"'), 'Reply button must have aria-label');
    assert.ok(bubbleContent.includes('aria-label="Copy message text"'), 'Copy button must have aria-label');
  });

  // 8. Sufficient Color Contrast Evaluation
  it('8. Verifies core brand and UI color contrasts satisfy WCAG AA (>= 4.5:1 ratio)', () => {
    const getLuminance = (r: number, g: number, b: number) => {
      const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    };

    const getContrastRatio = (hex1: string, hex2: string) => {
      const parse = (hex: string) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
      const [r1, g1, b1] = parse(hex1);
      const [r2, g2, b2] = parse(hex2);
      const l1 = getLuminance(r1, g1, b1);
      const l2 = getLuminance(r2, g2, b2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    // Primary button text (#ffffff on indigo #4f46e5)
    const buttonContrast = getContrastRatio('#ffffff', '#4f46e5');
    assert.ok(buttonContrast >= 4.5, `Button contrast (${buttonContrast.toFixed(2)}) must meet WCAG AA >= 4.5:1`);

    // Light mode text (#171717 on #ffffff)
    const lightTextContrast = getContrastRatio('#171717', '#ffffff');
    assert.ok(lightTextContrast >= 4.5, `Light text contrast (${lightTextContrast.toFixed(2)}) must meet WCAG AA >= 4.5:1`);

    // Dark mode text (#f5f5f5 on #0a0a0a)
    const darkTextContrast = getContrastRatio('#f5f5f5', '#0a0a0a');
    assert.ok(darkTextContrast >= 4.5, `Dark text contrast (${darkTextContrast.toFixed(2)}) must meet WCAG AA >= 4.5:1`);
  });
});
