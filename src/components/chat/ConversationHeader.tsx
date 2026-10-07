import React from 'react';
import { ChevronLeft, Search, Info, Users } from 'lucide-react';
import { Conversation, SafeUser } from '../../types/chat';
import { Avatar } from '../ui/Avatar';

interface ConversationHeaderProps {
  conversation: Conversation;
  currentUser: SafeUser | null;
  onlineUserIds: Set<string>;
  onBackMobile: () => void;
  onToggleSearch: () => void;
  onToggleInfo: () => void;
  isSearchOpen: boolean;
  isInfoOpen: boolean;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
  currentUser,
  onlineUserIds,
  onBackMobile,
  onToggleSearch,
  onToggleInfo,
  isSearchOpen,
  isInfoOpen,
}) => {
  const isDirect = conversation.type === 'direct';

  let title = conversation.name || 'Chat';
  let avatarSrc = conversation.avatar;
  let isOnline = false;
  let subtitle = '';

  if (isDirect) {
    if (conversation.otherUser) {
      title = conversation.otherUser.username;
      avatarSrc = conversation.otherUser.avatar;
      isOnline = onlineUserIds.has(conversation.otherUser.id);
      subtitle = isOnline ? 'Online' : 'Offline';
    }
  } else {
    const memberCount = conversation.members.length;
    const onlineCount = conversation.members.filter(m => onlineUserIds.has(m.userId)).length;
    subtitle = `${memberCount} members · ${onlineCount} online`;
  }

  return (
    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/60 backdrop-blur-md shrink-0 transition-colors">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile Back Button (Full-screen Chat Navigation) */}
        <button
          type="button"
          onClick={onBackMobile}
          aria-label="Back to conversations list"
          className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] p-2 -ml-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
          title="Back to conversations"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>

        <Avatar
          name={title}
          src={avatarSrc}
          size="md"
          isOnline={isOnline}
          showStatus={isDirect}
        />

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{title}</h2>
            {!isDirect && <Users className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" aria-hidden="true" />}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            {isDirect && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isOnline ? 'bg-emerald-500' : 'bg-neutral-400 dark:bg-neutral-600'
                }`}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{subtitle}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSearch}
          aria-label={isSearchOpen ? 'Close in-conversation search' : 'Search within this conversation'}
          aria-expanded={isSearchOpen}
          className={`p-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${
            isSearchOpen
              ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
          title="Search in conversation"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggleInfo}
          aria-label={isInfoOpen ? 'Close conversation details drawer' : 'View conversation details & members'}
          aria-expanded={isInfoOpen}
          className={`p-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${
            isInfoOpen
              ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
          title="Conversation Details"
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
