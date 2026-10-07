import React, { useState, useEffect } from 'react';
import { X, Save, Key, Bell, CheckCheck, Loader2, Moon, Sun, Monitor } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'profile' | 'preferences' | 'security';
}

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=alex&backgroundColor=6366f1',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=sam&backgroundColor=06b6d4',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=elena&backgroundColor=10b981',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=marcus&backgroundColor=f59e0b',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=felix&backgroundColor=ec4899',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=chloe&backgroundColor=8b5cf6',
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'profile',
}) => {
  const { user, updateUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();

  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(user?.readReceiptsEnabled ?? true);
  const [soundEnabled, setSoundEnabled] = useState(user?.soundEnabled ?? true);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'security'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (user) {
        setBio(user.bio || '');
        setAvatar(user.avatar || '');
        setReadReceiptsEnabled(user.readReceiptsEnabled ?? true);
        setSoundEnabled(user.soundEnabled ?? true);
      }
    }
  }, [isOpen, initialTab, user]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.users.updateProfile({
        bio: bio.trim(),
        avatar,
        readReceiptsEnabled,
        soundEnabled,
      });
      updateUser(res.user);
      toast.success('Profile updated successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);

    if (
      newPassword.length < 8 ||
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[@#$%!&*]/.test(newPassword) ||
      /\s/.test(newPassword)
    ) {
      const msg = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character (@#$%!&*) without spaces';
      setPwdMessage({ text: msg, error: true });
      toast.error(msg);
      return;
    }

    try {
      await api.users.changePassword(oldPassword, newPassword);
      setPwdMessage({ text: 'Password successfully updated' });
      toast.success('Password updated successfully');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPwdMessage({ text: err.message || 'Failed to change password', error: true });
      toast.error(err.message || 'Failed to change password');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-xs p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-[90vh] transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 mr-2">
            <div className="shrink-0">
              <Avatar name={user.username} src={avatar || user.avatar} size="md" isOnline={true} showStatus={true} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 id="profile-modal-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {user.username}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog (Esc)"
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label="Profile and Settings tabs" className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 text-xs font-medium">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
              activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preferences'}
            onClick={() => setActiveTab('preferences')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
              activeTab === 'preferences'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            onClick={() => setActiveTab('security')}
            className={`flex-1 py-2.5 text-center border-b-2 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
              activeTab === 'security'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Security
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Select Avatar Preset
                </label>
                <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Avatar presets">
                  {AVATAR_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      role="radio"
                      aria-checked={avatar === p}
                      aria-label={`Select avatar style ${idx + 1}`}
                      onClick={() => setAvatar(p)}
                      className={`relative rounded-full overflow-hidden p-0.5 border-2 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                        avatar === p
                          ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                          : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
                      }`}
                    >
                      <img src={p} alt={`Preset ${idx + 1}`} className="w-full h-full rounded-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="user-profile-bio" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Bio / Status
                </label>
                <textarea
                  id="user-profile-bio"
                  rows={3}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Share a short bio or status..."
                  className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-2.5 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                  Save Profile Changes
                </button>
              </div>
            </form>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-4">
              {/* Appearance / Theme Selector */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Theme & Appearance
                </label>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme mode selection">
                  {[
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'system', label: 'System', icon: Monitor },
                  ].map(item => {
                    const Icon = item.icon;
                    const isSelected = theme === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`${item.label} theme`}
                        onClick={() => setTheme(item.id as Theme)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Read Receipts Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <CheckCheck className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                  <div>
                    <label htmlFor="read-receipts-toggle" className="text-xs font-semibold text-neutral-900 dark:text-neutral-200 block cursor-pointer">
                      Read Receipts
                    </label>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block">
                      Let others see when you have read their messages
                    </span>
                  </div>
                </div>
                <input
                  id="read-receipts-toggle"
                  type="checkbox"
                  checked={readReceiptsEnabled}
                  onChange={e => setReadReceiptsEnabled(e.target.checked)}
                  aria-label="Toggle read receipts"
                  className="w-4 h-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Sound Notifications Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                  <div>
                    <label htmlFor="sound-notifications-toggle" className="text-xs font-semibold text-neutral-900 dark:text-neutral-200 block cursor-pointer">
                      Notification Sounds
                    </label>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block">
                      Play subtle audio chime on incoming messages
                    </span>
                  </div>
                </div>
                <input
                  id="sound-notifications-toggle"
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={e => setSoundEnabled(e.target.checked)}
                  aria-label="Toggle notification sounds"
                  className="w-4 h-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {pwdMessage && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className={`p-2.5 rounded-lg text-xs ${
                    pwdMessage.error
                      ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-200'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-200'
                  }`}
                >
                  {pwdMessage.text}
                </div>
              )}

              <div>
                <label htmlFor="current-password-input" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Current Password *
                </label>
                <input
                  id="current-password-input"
                  type="password"
                  required
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="new-password-input" className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  New Password *
                </label>
                <input
                  id="new-password-input"
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                  At least 8 characters (uppercase, lowercase, number, symbol)
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!oldPassword || !newPassword}
                  className="w-full py-2.5 px-4 text-xs font-semibold bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                >
                  <Key className="w-4 h-4" aria-hidden="true" />
                  Update Password
                </button>
              </div>

              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="w-full py-2 px-3 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                >
                  Sign Out of ChatSphere
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
