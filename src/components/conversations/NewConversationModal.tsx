import React, { useState, useEffect } from 'react';
import { X, Search, MessageSquare, Loader2 } from 'lucide-react';
import { SafeUser } from '../../types/chat';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';
import { useChat } from '../../context/ChatContext';
import { useToast } from '../../context/ToastContext';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({ isOpen, onClose }) => {
  const { addNewConversation } = useChat();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uniqueUsers = React.useMemo(() => {
    return Array.from(new Map(users.map(u => [u.id, u])).values());
  }, [users]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    const timer = setTimeout(() => {
      api.users
        .search(query)
        .then(res => {
          if (isMounted) {
            const unique = Array.from(new Map((res.users || []).map(u => [u.id, u])).values());
            setUsers(unique);
          }
        })
        .catch(err => {
          if (isMounted) setErrorMessage(err.message || 'Failed to search users');
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStartChat = async (targetUserId: string) => {
    setIsStarting(true);
    setErrorMessage(null);
    try {
      const res = await api.conversations.createDirect(targetUserId);
      addNewConversation(res.conversation);
      toast.success('Conversation started');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start conversation');
      toast.error(err.message || 'Failed to start conversation');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-convo-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h3 id="new-convo-modal-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Start Direct Conversation
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Search for team members to begin messaging</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog (Esc)"
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="relative flex items-center">
            <label htmlFor="convo-search-input" className="sr-only">
              Search team members by username or bio
            </label>
            <Search className="w-4 h-4 absolute left-3 text-neutral-400 dark:text-neutral-500 pointer-events-none" aria-hidden="true" />
            <input
              id="convo-search-input"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by username or bio..."
              className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="mx-4 mt-3 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1" role="list" aria-label="Search results">
          {isLoading ? (
            <div className="flex items-center justify-center p-6 text-xs text-neutral-400" aria-busy="true">
              <Loader2 className="w-4 h-4 animate-spin mr-2 text-indigo-500" aria-hidden="true" />
              Searching team members...
            </div>
          ) : uniqueUsers.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 dark:text-neutral-400">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" aria-hidden="true" />
              <p className="text-xs">No team members found</p>
            </div>
          ) : (
            uniqueUsers.map(u => (
              <button
                key={u.id}
                type="button"
                role="listitem"
                onClick={() => handleStartChat(u.id)}
                disabled={isStarting}
                className="w-full text-left flex items-center justify-between p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors cursor-pointer group focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={u.username} src={u.avatar} size="md" isOnline={u.status === 'online'} showStatus={true} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {u.username}
                    </div>
                    {u.bio && <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{u.bio}</div>}
                  </div>
                </div>
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Message &rarr;
                </span>
              </button>
            ))
          )}
        </div>

        {/* Invite Friend Footer */}
        {(() => {
          const shareUrl = (import.meta.env.VITE_SHARE_URL as string) || 'https://tinyurl.com/Chatsphere';
          return (
            <div className="p-3 bg-neutral-50 dark:bg-neutral-950/60 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="min-w-0">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">
                  Want to chat with a friend?
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block font-mono truncate">
                  Short Link: {shareUrl}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const text = encodeURIComponent(`Chat with me on ChatSphere: ${shareUrl}`);
                    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs whitespace-nowrap cursor-pointer transition-all shadow-xs active:scale-95"
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl);
                    toast.success(`Short link copied! (${shareUrl})`);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs whitespace-nowrap cursor-pointer transition-all shadow-xs active:scale-95"
                >
                  Copy Link
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
