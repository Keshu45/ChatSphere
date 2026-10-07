import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Users, Search, X, ArrowDown, Sparkles, RefreshCw, AlertCircle, Zap, ShieldCheck } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { ConversationHeader } from './ConversationHeader';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { ConversationInfoPanel } from './ConversationInfoPanel';
import { TypingIndicator } from './TypingIndicator';
import { ChatSphereLogo } from '../ui/ChatSphereLogo';
import { Message } from '../../types/chat';

interface ChatWindowProps {
  onBackMobile: () => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onOpenSwitcher: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  onBackMobile,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenSwitcher,
}) => {
  const { user } = useAuth();
  const { onlineUserIds, typingUsers } = useSocket();
  const {
    activeConversation,
    messages,
    isLoadingMessages,
    isLoadingOlder,
    hasMoreMessages,
    replyingTo,
    editingMessage,
    loadOlderMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    setReplyingTo,
    setEditingMessage,
    refreshConversations,
    selectConversation,
  } = useChat();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number>(0);

  // Keyboard shortcut: Escape to close in-chat search or info drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSearchOpen) {
          setIsSearchOpen(false);
          setInChatSearchQuery('');
        } else if (isInfoOpen) {
          setIsInfoOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, isInfoOpen]);

  // Preserve scroll anchor when older messages are prepended
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && previousScrollHeightRef.current > 0) {
      const heightDelta = el.scrollHeight - previousScrollHeightRef.current;
      if (heightDelta > 0) {
        el.scrollTop += heightDelta;
      }
      previousScrollHeightRef.current = 0;
    }
  }, [messages]);

  // Auto scroll to bottom when new messages arrive (unless scrolled up)
  useEffect(() => {
    if (!showScrollBottom && previousScrollHeightRef.current === 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showScrollBottom]);

  // Handle scroll events for "Load Older" and "Scroll to bottom" button
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollBottom(!isNearBottom);

    if (el.scrollTop <= 20 && hasMoreMessages && !isLoadingOlder) {
      previousScrollHeightRef.current = el.scrollHeight;
      loadOlderMessages();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Filter messages if search query active and guarantee unique keys
  const filteredMessages = React.useMemo(() => {
    const list = inChatSearchQuery.trim()
      ? messages.filter(m => m.text.toLowerCase().includes(inChatSearchQuery.toLowerCase()))
      : messages;
    return Array.from(new Map(list.map(m => [m.id, m])).values());
  }, [messages, inChatSearchQuery]);

  // Determine user's last read message for the Unread Separator
  const userMembership = activeConversation?.members.find(m => m.userId === user?.id);
  const lastReadMessageId = userMembership?.lastReadMessageId;

  // Find index where unread messages start
  let unreadStartIndex = -1;
  if (lastReadMessageId && filteredMessages.length > 0) {
    const lastReadIdx = filteredMessages.findIndex(m => m.id === lastReadMessageId);
    if (lastReadIdx !== -1 && lastReadIdx < filteredMessages.length - 1) {
      // Unread messages start after lastReadIdx if from another sender
      const nextMsg = filteredMessages[lastReadIdx + 1];
      if (nextMsg && nextMsg.senderId !== user?.id) {
        unreadStartIndex = lastReadIdx + 1;
      }
    }
  }

  // Group messages by date for date separators and insert unread divider
  const renderMessagesWithDateSeparators = () => {
    let lastDate = '';
    return filteredMessages.map((msg: Message, idx: number) => {
      const msgDate = new Date(msg.createdAt).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const showDate = msgDate !== lastDate;
      lastDate = msgDate;
      const isFirstUnread = idx === unreadStartIndex;

      return (
        <React.Fragment key={msg.id}>
          {/* Date Separator */}
          {showDate && (
            <div className="flex items-center gap-3 my-4 select-none px-4">
              <div className="flex-1 h-px bg-neutral-200/80 dark:bg-neutral-800/80" />
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800 rounded-md px-2.5 py-0.5 shadow-2xs">
                {msgDate}
              </span>
              <div className="flex-1 h-px bg-neutral-200/80 dark:bg-neutral-800/80" />
            </div>
          )}

          {/* Unread Separator */}
          {isFirstUnread && (
            <div
              className="flex items-center gap-3 my-4 select-none animate-fade-in"
              role="separator"
              aria-label="Unread messages divider"
            >
              <div className="flex-1 h-px bg-indigo-500/40 dark:bg-indigo-400/30" />
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800/80 rounded-full px-3 py-0.5 shadow-xs">
                Unread Messages
              </span>
              <div className="flex-1 h-px bg-indigo-500/40 dark:bg-indigo-400/30" />
            </div>
          )}

          <MessageBubble
            message={msg}
            currentUser={user}
            isGroup={activeConversation?.type === 'group'}
            onReply={setReplyingTo}
            onEdit={setEditingMessage}
            onDelete={deleteMessage}
          />
        </React.Fragment>
      );
    });
  };

  // If no conversation is selected, show sleek Welcome / Demo Dashboard
  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 text-center relative overflow-hidden bg-gradient-to-b from-neutral-50/50 via-white to-neutral-50/80 dark:from-neutral-950 dark:via-neutral-900/40 dark:to-neutral-950 transition-colors">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 inset-x-0 h-64 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(99,102,241,0.18),transparent)] pointer-events-none" />

        <div className="relative max-w-md w-full space-y-6">
          {/* Logo Emblem */}
          <div className="flex flex-col items-center justify-center">
            <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-xl shadow-indigo-500/5 mb-3.5 transition-transform hover:scale-105 duration-200">
              <ChatSphereLogo size="xl" showWordmark={false} withGlow={true} />
            </div>

            {/* Clean Unboxed Metadata Separators (Zero-Pill Discipline) */}
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
              <span>Real-Time Engine</span>
              <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">·</span>
              <span>Authoritative Sync</span>
              <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">·</span>
              <span>Live Presence</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-neutral-100 tracking-tight">
              ChatSphere Workspace
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-sm mx-auto">
              Real-time messaging with bidirectional Socket.io sync, authoritative delivery checkmarks, and instant multi-device presence.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={onOpenNewChat}
              className="flex items-center justify-center gap-2.5 p-3.5 text-xs font-semibold rounded-2xl bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-900 dark:text-neutral-100 border border-neutral-200/80 dark:border-neutral-800 transition-all cursor-pointer shadow-xs hover:border-indigo-400/50 dark:hover:border-indigo-500/50 group active:scale-[0.98]"
            >
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="font-semibold">Direct Message</span>
            </button>
            <button
              onClick={onOpenNewGroup}
              className="flex items-center justify-center gap-2.5 p-3.5 text-xs font-semibold rounded-2xl bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-850 text-neutral-900 dark:text-neutral-100 border border-neutral-200/80 dark:border-neutral-800 transition-all cursor-pointer shadow-xs hover:border-indigo-400/50 dark:hover:border-indigo-500/50 group active:scale-[0.98]"
            >
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                <Users className="w-4 h-4" />
              </div>
              <span className="font-semibold">Team Channel</span>
            </button>
          </div>

          {/* Testing Guide Card */}
          {import.meta.env.VITE_DEMO_MODE !== 'false' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800 text-left shadow-xs backdrop-blur-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Multi-Device Testing Guide
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </div>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed mb-3.5">
                Open ChatSphere in a second browser window, use <strong>Switch User</strong> to sign in as a teammate, and observe instant message delivery checkmarks, typing indicators, and presence transitions!
              </p>
              <button
                onClick={onOpenSwitcher}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-950 rounded-xl transition-all cursor-pointer shadow-xs active:scale-[0.99]"
              >
                Switch Active Demo Account
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentTypingUsers = (typingUsers[activeConversation.id] || []).filter(
    u => u !== user?.username
  );

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden bg-neutral-50 dark:bg-neutral-950 transition-colors">
      {/* Main Chat Column */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <ConversationHeader
          conversation={activeConversation}
          currentUser={user}
          onlineUserIds={onlineUserIds}
          onBackMobile={onBackMobile}
          onToggleSearch={() => setIsSearchOpen(!isSearchOpen)}
          onToggleInfo={() => setIsInfoOpen(!isInfoOpen)}
          isSearchOpen={isSearchOpen}
          isInfoOpen={isInfoOpen}
        />

        {/* In-chat search bar */}
        {isSearchOpen && (
          <div role="search" aria-label="Conversation search" className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/80 animate-fade-in">
            <Search className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={inChatSearchQuery}
              onChange={e => setInChatSearchQuery(e.target.value)}
              placeholder="Search in this conversation..."
              aria-label="Search text in this conversation"
              className="flex-1 bg-transparent text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none"
              autoFocus
            />
            {inChatSearchQuery && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                {filteredMessages.length} results
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setInChatSearchQuery('');
              }}
              aria-label="Close search (Esc)"
              title="Close search (Esc)"
              className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Error / Retry Banner */}
        {loadError && (
          <div role="alert" aria-live="assertive" className="flex items-center justify-between p-3 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                selectConversation(activeConversation.id);
              }}
              className="flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300 hover:underline cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none rounded px-1"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* Message Stream */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Message stream"
          aria-live="polite"
          tabIndex={0}
          className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-1 relative focus-visible:ring-1 focus-visible:ring-indigo-500/50 focus-visible:outline-none"
        >
          {/* Pagination Trigger / Indicator */}
          {hasMoreMessages && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={isLoadingOlder}
                aria-label="Load older conversation messages"
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isLoadingOlder ? 'Loading older messages...' : 'Load previous messages'}
              </button>
            </div>
          )}

          {isLoadingMessages ? (
            /* Sleek Message Stream Skeleton */
            <div className="space-y-4 p-2 sm:p-4" aria-busy="true" aria-label="Loading message stream skeleton">
              {[
                { isMe: false, w: 'w-48' },
                { isMe: true, w: 'w-64' },
                { isMe: false, w: 'w-56' },
                { isMe: true, w: 'w-36' },
                { isMe: false, w: 'w-72' },
              ].map((s, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2.5 ${s.isMe ? 'flex-row-reverse' : 'flex-row'} items-end`}
                >
                  <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse shrink-0" />
                  <div
                    className={`h-12 ${s.w} rounded-2xl bg-neutral-200/80 dark:bg-neutral-850 animate-pulse ${
                      s.isMe ? 'rounded-tr-none' : 'rounded-tl-none'
                    }`}
                  />
                </div>
              ))}
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 dark:text-neutral-400">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-neutral-400 dark:text-neutral-500" aria-hidden="true" />
              <p className="text-xs">No messages yet. Send a greeting to start the conversation!</p>
            </div>
          ) : (
            renderMessagesWithDateSeparators()
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom floating button */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to newest messages"
            className="absolute bottom-24 right-6 z-30 p-2.5 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-700 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
            title="Scroll to latest"
          >
            <ArrowDown className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        {/* Typing indicator */}
        <TypingIndicator usernames={currentTypingUsers} />

        {/* Message Composer */}
        <MessageComposer
          conversationId={activeConversation.id}
          replyingTo={replyingTo}
          editingMessage={editingMessage}
          onSendMessage={sendMessage}
          onEditMessage={editMessage}
          onCancelReply={() => setReplyingTo(null)}
          onCancelEdit={() => setEditingMessage(null)}
        />
      </div>

      {/* Info Panel Drawer */}
      {isInfoOpen && (
        <ConversationInfoPanel
          conversation={activeConversation}
          currentUser={user}
          onlineUserIds={onlineUserIds}
          onClose={() => setIsInfoOpen(false)}
          onRefreshConversation={refreshConversations}
        />
      )}
    </div>
  );
};
