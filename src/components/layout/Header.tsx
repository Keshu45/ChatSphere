import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../ui/Avatar';
import { ChatSphereLogo } from '../ui/ChatSphereLogo';
import { Users, Wifi, WifiOff, Sun, Moon, Settings, Share2 } from 'lucide-react';

interface HeaderProps {
  onOpenSwitcher: () => void;
  onOpenProfile: (tab?: 'profile' | 'preferences' | 'security') => void;
  onOpenShare?: () => void;
  activeTab: 'chats' | 'channels' | 'direct';
  setActiveTab: (tab: 'chats' | 'channels' | 'direct') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSwitcher,
  onOpenProfile,
  onOpenShare,
  activeTab,
  setActiveTab,
}) => {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <header
      role="banner"
      className="flex items-center justify-between px-2.5 sm:px-6 py-2 sm:py-2.5 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md shrink-0 select-none z-30 transition-colors shadow-2xs w-full max-w-full overflow-hidden"
    >
      {/* Zone 1: Brand Logo & Wordmark */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
        <ChatSphereLogo size="sm" showWordmark={true} withGlow={true} />
      </div>

      {/* Zone 2: Navigation links */}
      <nav
        aria-label="Chat categories"
        className="hidden md:flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100/70 dark:bg-neutral-900/60 p-1 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60"
      >
        <button
          type="button"
          onClick={() => setActiveTab('chats')}
          aria-current={activeTab === 'chats' ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
            activeTab === 'chats'
              ? 'bg-white dark:bg-neutral-800 text-neutral-950 dark:text-neutral-100 shadow-2xs font-semibold'
              : 'hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          All Chats
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('direct')}
          aria-current={activeTab === 'direct' ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
            activeTab === 'direct'
              ? 'bg-white dark:bg-neutral-800 text-neutral-950 dark:text-neutral-100 shadow-2xs font-semibold'
              : 'hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          Direct Messages
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('channels')}
          aria-current={activeTab === 'channels' ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
            activeTab === 'channels'
              ? 'bg-white dark:bg-neutral-800 text-neutral-950 dark:text-neutral-100 shadow-2xs font-semibold'
              : 'hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          Team Channels
        </button>
      </nav>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Real-time Socket Connection Status Badge */}
        <div
          role="status"
          aria-live="polite"
          aria-label={isConnected ? 'Real-time WebSocket connected' : 'Connecting to real-time engine'}
          className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800/60 text-[11px] text-neutral-600 dark:text-neutral-400"
          title={isConnected ? 'Real-time WebSocket connected' : 'Connecting to real-time engine...'}
        >
          {isConnected ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 animate-pulse" />
            </span>
          )}
          <span className="tabular-nums font-medium">
            {isConnected ? 'Live' : 'Connecting'}
          </span>
        </div>

        {/* Theme Toggle Button (Light/Dark Mode) */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="p-1.5 sm:p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 rounded-xl hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer shadow-2xs shrink-0"
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-neutral-700" aria-hidden="true" />
          )}
        </button>

        {/* Settings Button (Desktop/Tablet) */}
        <button
          type="button"
          onClick={() => onOpenProfile('preferences')}
          aria-label="Settings and preferences"
          className="hidden md:flex p-1.5 sm:p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 rounded-xl hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer shadow-2xs shrink-0"
          title="Settings (Read receipts, sounds, theme)"
        >
          <Settings className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
        </button>

        {/* Share App Link Button */}
        {onOpenShare && (
          <button
            type="button"
            onClick={onOpenShare}
            aria-label="Share short app link with friends"
            className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer shadow-xs active:scale-95 shrink-0"
            title="Share short app link (https://tinyurl.com/Chatsphere)"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </button>
        )}

        {/* Quick Switcher Button */}
        {import.meta.env.VITE_DEMO_MODE !== 'false' && (
          <button
            type="button"
            onClick={onOpenSwitcher}
            aria-label="Switch demo user account"
            className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 rounded-xl hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer shadow-2xs shrink-0"
            title="Switch between demo accounts to test real-time chat"
          >
            <Users className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
            <span className="hidden sm:inline">Switch</span>
          </button>
        )}

        {/* User Profile Trigger */}
        {user && (
          <button
            type="button"
            onClick={() => onOpenProfile('profile')}
            aria-label={`Profile and account settings for ${user.username}`}
            className="flex items-center gap-1 p-0.5 rounded-full hover:ring-2 hover:ring-indigo-500/60 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none shrink-0"
            title="Profile & Status"
          >
            <Avatar name={user.username} src={user.avatar} size="sm" isOnline={true} showStatus={true} />
          </button>
        )}
      </div>
    </header>
  );
};
