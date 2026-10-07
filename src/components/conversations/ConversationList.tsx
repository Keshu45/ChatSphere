import React, { useState } from 'react';
import { Search, Users, MessageSquarePlus, MessageSquare, X } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { ConversationItem } from './ConversationItem';

interface ConversationListProps {
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onCloseMobile?: () => void;
  activeFilter?: 'all' | 'direct' | 'group';
  onFilterChange?: (filter: 'all' | 'direct' | 'group') => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  onOpenNewChat,
  onOpenNewGroup,
  onCloseMobile,
  activeFilter,
  onFilterChange,
}) => {
  const { user } = useAuth();
  const { conversations, activeConversation, selectConversation, isLoadingConversations } = useChat();
  const { onlineUserIds } = useSocket();

  const [localFilter, setLocalFilter] = useState<'all' | 'direct' | 'group'>('all');
  const [searchFilter, setSearchFilter] = useState('');

  const currentFilter = activeFilter !== undefined ? activeFilter : localFilter;

  const handleSetFilter = (f: 'all' | 'direct' | 'group') => {
    if (onFilterChange) {
      onFilterChange(f);
    } else {
      setLocalFilter(f);
    }
  };

  const uniqueConversations = React.useMemo(() => {
    return Array.from(new Map(conversations.map(c => [c.id, c])).values());
  }, [conversations]);

  const filtered = uniqueConversations.filter(c => {
    // Type filter
    if (currentFilter === 'direct' && c.type !== 'direct') return false;
    if (currentFilter === 'group' && c.type !== 'group') return false;

    // Search query filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchName = c.name?.toLowerCase().includes(q);
      const matchOther = c.otherUser?.username.toLowerCase().includes(q);
      const matchMsg = c.lastMessage?.text.toLowerCase().includes(q);
      return matchName || matchOther || matchMsg;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-950 w-full shrink-0 select-none transition-colors">
      {/* Search & Actions Header */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Conversations
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenNewChat}
              aria-label="Start new direct message"
              className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
              title="New direct message"
            >
              <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenNewGroup}
              aria-label="Create new team channel"
              className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
              title="New channel"
            >
              <Users className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative flex items-center">
          <label htmlFor="conversation-filter-input" className="sr-only">
            Filter conversations by user or message content
          </label>
          <Search className="w-3.5 h-3.5 absolute left-3 text-neutral-400 dark:text-neutral-500 pointer-events-none" aria-hidden="true" />
          <input
            id="conversation-filter-input"
            type="text"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Filter conversations..."
            className="w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter('')}
              aria-label="Clear conversation filter"
              className="absolute right-2 p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Segmented Control Tabs */}
        <div role="tablist" aria-label="Conversation filters" className="flex items-center gap-1 p-0.5 bg-neutral-100 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium">
          <button
            type="button"
            role="tab"
            aria-selected={currentFilter === 'all'}
            onClick={() => handleSetFilter('all')}
            className={`flex-1 py-1 text-center rounded-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
              currentFilter === 'all'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentFilter === 'direct'}
            onClick={() => handleSetFilter('direct')}
            className={`flex-1 py-1 text-center rounded-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
              currentFilter === 'direct'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Direct
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentFilter === 'group'}
            onClick={() => handleSetFilter('group')}
            className={`flex-1 py-1 text-center rounded-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
              currentFilter === 'group'
                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Channels
          </button>
        </div>
      </div>

      {/* List Stream */}
      <div role="list" aria-label="Conversation items" className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoadingConversations ? (
          /* Loading Skeleton for Conversation List */
          <div className="space-y-2 p-1" aria-busy="true" aria-label="Loading conversations">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900/40 animate-pulse border border-neutral-200/50 dark:border-neutral-800/40"
              >
                <div className="w-10 h-10 rounded-full bg-neutral-300 dark:bg-neutral-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 w-24 bg-neutral-300 dark:bg-neutral-800 rounded" />
                    <div className="h-2.5 w-10 bg-neutral-200 dark:bg-neutral-800 rounded" />
                  </div>
                  <div className="h-2.5 w-36 bg-neutral-200 dark:bg-neutral-800/60 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-neutral-500 dark:text-neutral-400 space-y-2.5">
            <MessageSquare className="w-8 h-8 mx-auto opacity-30 text-neutral-400" aria-hidden="true" />
            <p className="text-xs font-medium">
              {searchFilter ? `No conversations matching "${searchFilter}"` : 'No conversations found'}
            </p>
            {searchFilter ? (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
              >
                Clear filter
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenNewChat}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
              >
                Start a direct conversation
              </button>
            )}
          </div>
        ) : (
          filtered.map(conv => {
            const isOnline = conv.type === 'direct' && Boolean(
              conv.otherUser && onlineUserIds.has(conv.otherUser.id)
            );
            return (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                currentUser={user}
                isActive={activeConversation?.id === conv.id}
                isOnline={isOnline}
                onSelect={() => {
                  selectConversation(conv.id);
                  if (onCloseMobile) onCloseMobile();
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
