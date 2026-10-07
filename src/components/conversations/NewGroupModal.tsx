import React, { useState, useEffect } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { SafeUser } from '../../types/chat';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';
import { useChat } from '../../context/ChatContext';
import { useToast } from '../../context/ToastContext';

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({ isOpen, onClose }) => {
  const { addNewConversation } = useChat();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [availableUsers, setAvailableUsers] = useState<SafeUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uniqueUsers = React.useMemo(() => {
    return Array.from(new Map(availableUsers.map(u => [u.id, u])).values());
  }, [availableUsers]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingUsers(true);
    setErrorMessage(null);

    api.users
      .list()
      .then(res => {
        if (isMounted) {
          const unique = Array.from(new Map((res.users || []).map(u => [u.id, u])).values());
          setAvailableUsers(unique);
        }
      })
      .catch(err => {
        if (isMounted) setErrorMessage(err.message || 'Failed to load team members');
      })
      .finally(() => {
        if (isMounted) setIsLoadingUsers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Channel name is required');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.conversations.createGroup(name.trim(), description.trim(), selectedUserIds);
      addNewConversation(res.conversation);
      toast.success(`Channel "#${name.trim()}" created successfully`);
      onClose();
      setName('');
      setDescription('');
      setSelectedUserIds([]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create channel');
      toast.error(err.message || 'Failed to create channel');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-group-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h3 id="new-group-modal-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Create Team Channel
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Collaborate with multiple teammates in a shared channel</p>
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

        <form onSubmit={handleCreateGroup} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Channel Name */}
            <div>
              <label htmlFor="group-name-input" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Channel Name *
              </label>
              <input
                id="group-name-input"
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. engineering, general, design-reviews"
                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="group-desc-input" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Purpose / Description (Optional)
              </label>
              <textarea
                id="group-desc-input"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this channel for?"
                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none"
              />
            </div>

            {/* Add Teammates Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Select Members ({selectedUserIds.length})
                </label>
                {selectedUserIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds([])}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer focus-visible:ring-1 focus-visible:ring-indigo-500 rounded px-1"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              <div
                role="group"
                aria-label="Teammate selection list"
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/60"
              >
                {isLoadingUsers ? (
                  <div className="p-4 text-center text-xs text-neutral-400" aria-busy="true">Loading teammates...</div>
                ) : uniqueUsers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-neutral-400">No teammates available</div>
                ) : (
                  uniqueUsers.map(u => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Select teammate ${u.username}`}
                        onClick={() => toggleUserSelection(u.id)}
                        className={`w-full text-left flex items-center justify-between p-2.5 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-neutral-900 dark:text-neutral-100'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={u.username} src={u.avatar} size="sm" isOnline={u.status === 'online'} showStatus={true} />
                          <span className="text-xs font-medium truncate">{u.username}</span>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
