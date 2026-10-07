import React from 'react';
import { Conversation, SafeUser } from '../../types/chat';
import { Avatar } from '../ui/Avatar';
import { Users, ImageIcon, FileText } from 'lucide-react';

interface ConversationItemProps {
  conversation: Conversation;
  currentUser: SafeUser | null;
  isActive: boolean;
  isOnline: boolean;
  onSelect: () => void;
}

const ConversationItemComponent: React.FC<ConversationItemProps> = ({
  conversation,
  currentUser,
  isActive,
  isOnline,
  onSelect,
}) => {
  const isDirect = conversation.type === 'direct';

  let title = conversation.name || 'Chat';
  let avatarSrc = conversation.avatar;

  if (isDirect && conversation.otherUser) {
    title = conversation.otherUser.username;
    avatarSrc = conversation.otherUser.avatar;
  }

  const formatTimestamp = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 24 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const lastMessage = conversation.lastMessage;
  const unreadCount = conversation.unreadCount || 0;

  const itemAriaLabel = `Conversation with ${title}${isOnline ? ', online' : ''}${
    unreadCount > 0 ? `, ${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : ''
  }`;

  return (
    <button
      type="button"
      role="listitem"
      aria-selected={isActive}
      aria-label={itemAriaLabel}
      onClick={onSelect}
      className={`relative w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
        isActive
          ? 'bg-neutral-100 dark:bg-neutral-900/90 text-neutral-950 dark:text-neutral-100 shadow-xs ring-1 ring-neutral-200/90 dark:ring-neutral-800 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-indigo-600 dark:before:bg-indigo-400 before:rounded-r-full'
          : 'hover:bg-neutral-100/60 dark:hover:bg-neutral-900/50 text-neutral-700 dark:text-neutral-300'
      }`}
    >
      <Avatar
        name={title}
        src={avatarSrc}
        size="md"
        isOnline={isOnline}
        showStatus={isDirect}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-200 truncate">{title}</span>
            {!isDirect && <Users className="w-3 h-3 text-neutral-500 dark:text-neutral-400 shrink-0" aria-hidden="true" />}
          </div>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
            {formatTimestamp(lastMessage?.createdAt || conversation.updatedAt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 truncate">
            {lastMessage?.type === 'image' && <ImageIcon className="w-3.5 h-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />}
            {lastMessage?.type === 'file' && <FileText className="w-3.5 h-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />}
            <span className="truncate">
              {lastMessage ? (
                <>
                  {lastMessage.senderId === currentUser?.id ? 'You: ' : ''}
                  {lastMessage.text}
                </>
              ) : (
                <span className="italic text-neutral-400 dark:text-neutral-500">No messages yet</span>
              )}
            </span>
          </div>

          {unreadCount > 0 && (
            <span className="shrink-0 bg-indigo-600 dark:bg-neutral-100 text-white dark:text-neutral-950 font-bold text-[10px] rounded-full px-1.5 py-0.5 min-w-4 text-center tabular-nums shadow-xs">
              {unreadCount > 99 ? '99+' : unreadCount}
              <span className="sr-only"> unread</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export const ConversationItem = React.memo(ConversationItemComponent);
