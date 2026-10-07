import React, { useState } from 'react';
import { X, Users, Check, ArrowRight, UserPlus, Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar } from '../ui/Avatar';

interface AccountSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCustomAuth: () => void;
}

const DEMO_ACCOUNTS = [
  {
    username: 'alex_rivera',
    name: 'Alex Rivera',
    role: 'Product Lead',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex&backgroundColor=6366f1',
    description: 'Active in #engineering and direct conversations.',
  },
  {
    username: 'sam_chen',
    name: 'Sam Chen',
    role: 'Frontend Architect',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sam&backgroundColor=06b6d4',
    description: 'Specializes in real-time UI components.',
  },
  {
    username: 'elena_rostova',
    name: 'Elena Rostova',
    role: 'Security Engineer',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=elena&backgroundColor=10b981',
    description: 'Authoritative audit & session validation.',
  },
  {
    username: 'marcus_vance',
    name: 'Marcus Vance',
    role: 'Backend Platform',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marcus&backgroundColor=f59e0b',
    description: 'Engineers distributed Socket.io clustering.',
  },
];

export const AccountSwitcherModal: React.FC<AccountSwitcherModalProps> = ({
  isOpen,
  onClose,
  onOpenCustomAuth,
}) => {
  const { user, quickSwitchUser } = useAuth();
  const toast = useToast();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSwitch = async (username: string) => {
    if (user?.username === username) {
      onClose();
      return;
    }

    setSwitchingTo(username);
    try {
      await quickSwitchUser(username);
      toast.success(`Switched account to @${username}`);
      onClose();
    } catch (err: any) {
      toast.error(`Switch failed: ${err.message}`);
    } finally {
      setSwitchingTo(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-switcher-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-neutral-300" aria-hidden="true" />
            <h3 id="account-switcher-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Switch Demo Account
            </h3>
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

        {/* Explanatory Prompt */}
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-950/60 border-b border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Switch seamlessly between teammate personas to test real-time typing indicators, read receipts, and delivery statuses.
        </div>

        {/* Demo Accounts List */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1">
          {DEMO_ACCOUNTS.map(acc => {
            const isCurrent = user?.username === acc.username;
            const isPending = switchingTo === acc.username;

            return (
              <button
                key={acc.username}
                type="button"
                onClick={() => handleSwitch(acc.username)}
                disabled={isPending}
                className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                  isCurrent
                    ? 'border-indigo-600/60 bg-indigo-50/70 dark:bg-indigo-950/40 text-neutral-900 dark:text-neutral-100 shadow-xs'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={acc.username} src={acc.avatar} size="md" isOnline={true} showStatus={true} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">{acc.name}</span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">@{acc.username}</span>
                    </div>
                    <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">{acc.role}</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{acc.description}</div>
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                  ) : isCurrent ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-200 group-hover:translate-x-0.5 transition-all" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer: Custom Sign In Option */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 flex items-center justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Want to use custom credentials?</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCustomAuth();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Custom Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
