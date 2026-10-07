import React, { useState } from 'react';
import { X, Users, UserPlus, LogOut, Shield, Trash2, Calendar, Loader2 } from 'lucide-react';
import { Conversation, SafeUser } from '../../types/chat';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface ConversationInfoPanelProps {
  conversation: Conversation;
  currentUser: SafeUser | null;
  onlineUserIds: Set<string>;
  onClose: () => void;
  onRefreshConversation: () => void;
}

export const ConversationInfoPanel: React.FC<ConversationInfoPanelProps> = ({
  conversation,
  currentUser,
  onlineUserIds,
  onClose,
  onRefreshConversation,
}) => {
  const toast = useToast();
  const isGroup = conversation.type === 'group';
  const isAdmin = conversation.members.some(
    m => m.userId === currentUser?.id && m.role === 'admin'
  );

  const [showAddMember, setShowAddMember] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<SafeUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  React.useEffect(() => {
    if (showAddMember) {
      api.users.list().then(res => {
        const existingIds = new Set(conversation.members.map(m => m.userId));
        const unique = Array.from(new Map((res.users || []).map(u => [u.id, u])).values());
        setAvailableUsers(unique.filter(u => !existingIds.has(u.id)));
      });
    }
  }, [showAddMember, conversation.members]);

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    setIsLoading(true);
    try {
      await api.conversations.addMembers(conversation.id, [selectedUserId]);
      setShowAddMember(false);
      setSelectedUserId('');
      onRefreshConversation();
      toast.success('Member added to channel');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add member');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    try {
      await api.conversations.removeMember(conversation.id, targetUserId);
      setConfirmRemoveId(null);
      onRefreshConversation();
      toast.success('Member removed from channel');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member');
    }
  };

  const handleLeaveGroup = async () => {
    if (!currentUser) return;
    try {
      await api.conversations.removeMember(conversation.id, currentUser.id);
      onClose();
      onRefreshConversation();
      toast.success('You have left the channel');
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave channel');
    }
  };

  const title = isGroup ? conversation.name : conversation.otherUser?.username || 'Details';

  return (
    <aside
      aria-label="Conversation details"
      className="w-full sm:w-80 border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex flex-col h-full shrink-0 select-none animate-fade-in transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Details
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation details"
          className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-850 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        {/* Profile Card */}
        <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800">
          <Avatar
            name={title || 'Chat'}
            src={conversation.avatar || conversation.otherUser?.avatar}
            size="lg"
            className="mb-3"
            isOnline={isGroup ? false : onlineUserIds.has(conversation.otherUser?.id || '')}
            showStatus={!isGroup}
          />
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h4>
          {conversation.description && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{conversation.description}</p>
          )}
          {conversation.otherUser?.bio && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{conversation.otherUser.bio}</p>
          )}

          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>Created {new Date(conversation.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Group Members Section */}
        {isGroup && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Members ({conversation.members.length})
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddMember(!showAddMember)}
                  aria-label="Add members to channel"
                  className="p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 cursor-pointer"
                  title="Add Member"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Add Member Dropdown */}
            {showAddMember && (
              <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2 animate-fade-in">
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Select Teammate
                </label>
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-lg p-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Choose a user...</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddMember(false)}
                    className="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddMember}
                    disabled={!selectedUserId || isLoading}
                    className="px-3 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Members List */}
            <div className="space-y-1">
              {Array.from(new Map(conversation.members.map(m => [m.userId, m])).values()).map(member => {
                const isOnline = onlineUserIds.has(member.userId);
                const isMeMember = member.userId === currentUser?.id;
                const isConfirming = confirmRemoveId === member.userId;

                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-900/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={member.userId}
                        size="sm"
                        isOnline={isOnline}
                        showStatus={true}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-neutral-900 dark:text-neutral-200 truncate">
                            {member.userId === currentUser?.id ? 'You' : member.userId}
                          </span>
                          {member.role === 'admin' && (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-900/60">
                              Admin
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-neutral-400">
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    {isAdmin && !isMeMember && (
                      <div>
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member.userId)}
                              className="px-2 py-0.5 text-[11px] font-semibold bg-rose-600 text-white rounded hover:bg-rose-500 cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(null)}
                              className="px-1 text-[11px] text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(member.userId)}
                            aria-label={`Remove user ${member.userId} from channel`}
                            className="p-1 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded focus-visible:ring-1 focus-visible:ring-rose-500 cursor-pointer"
                            title="Remove Member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Leave Channel Action */}
        {isGroup && (
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
            {confirmLeave ? (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 space-y-2">
                <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">Are you sure you want to leave this channel?</p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(false)}
                    className="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleLeaveGroup}
                    className="px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg cursor-pointer"
                  >
                    Leave Channel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="w-full flex items-center justify-center gap-2 p-2.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Leave Channel
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
