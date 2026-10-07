import React, { useState } from 'react';
import { Header } from './Header';
import { ConversationList } from '../conversations/ConversationList';
import { ChatWindow } from '../chat/ChatWindow';
import { NewConversationModal } from '../conversations/NewConversationModal';
import { NewGroupModal } from '../conversations/NewGroupModal';
import { UserProfileModal } from '../profile/UserProfileModal';
import { AccountSwitcherModal } from '../profile/AccountSwitcherModal';
import { AuthModal } from '../auth/AuthModal';
import { ShareAppModal } from '../share/ShareAppModal';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

export const AppLayout: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { activeConversation, selectConversation } = useChat();

  const [activeTab, setActiveTab] = useState<'chats' | 'channels' | 'direct'>('chats');
  const [profileTab, setProfileTab] = useState<'profile' | 'preferences' | 'security'>('profile');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCustomAuthOpen, setIsCustomAuthOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Map header activeTab to conversation list filter
  const activeFilter: 'all' | 'direct' | 'group' =
    activeTab === 'chats' ? 'all' : activeTab === 'direct' ? 'direct' : 'group';

  const handleFilterChange = (filter: 'all' | 'direct' | 'group') => {
    if (filter === 'all') setActiveTab('chats');
    else if (filter === 'direct') setActiveTab('direct');
    else if (filter === 'group') setActiveTab('channels');
  };

  const handleOpenProfile = (tab: 'profile' | 'preferences' | 'security' = 'profile') => {
    setProfileTab(tab);
    setIsProfileOpen(true);
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] max-h-[100dvh] w-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans selection:bg-indigo-500/20 selection:text-indigo-600 dark:selection:bg-neutral-800 transition-colors">
      {/* Skip to Main Content Link for Keyboard and Screen Reader Users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:font-medium focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Top Bar Header */}
      <Header
        onOpenSwitcher={() => setIsSwitcherOpen(true)}
        onOpenProfile={handleOpenProfile}
        onOpenShare={() => setIsShareOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Conversation List (Primary screen on mobile when no conversation is active) */}
        <aside
          aria-label="Conversations sidebar"
          className={`${
            activeConversation ? 'hidden md:flex' : 'flex'
          } w-full md:w-80 lg:w-88 h-full shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950`}
        >
          <ConversationList
            onOpenNewChat={() => setIsNewChatOpen(true)}
            onOpenNewGroup={() => setIsNewGroupOpen(true)}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
          />
        </aside>

        {/* Right Main Panel: Full screen Chat Window on mobile when active, or empty dashboard on desktop */}
        <main
          id="main-content"
          role="main"
          aria-label="Main chat area"
          className={`${
            !activeConversation ? 'hidden md:flex' : 'flex'
          } flex-1 h-full min-w-0 bg-neutral-100/60 dark:bg-neutral-950`}
        >
          <ChatWindow
            onBackMobile={() => selectConversation(null)}
            onOpenNewChat={() => setIsNewChatOpen(true)}
            onOpenNewGroup={() => setIsNewGroupOpen(true)}
            onOpenSwitcher={() => setIsSwitcherOpen(true)}
          />
        </main>
      </div>

      {/* Modals & Dialogs (Accessible, responsive, small-screen friendly) */}
      <NewConversationModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
      />

      <NewGroupModal
        isOpen={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
      />

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        initialTab={profileTab}
      />

      {import.meta.env.VITE_DEMO_MODE !== 'false' && (
        <AccountSwitcherModal
          isOpen={isSwitcherOpen}
          onClose={() => setIsSwitcherOpen(false)}
          onOpenCustomAuth={() => setIsCustomAuthOpen(true)}
        />
      )}

      <AuthModal
        isOpen={(!user && !isAuthLoading) || isCustomAuthOpen}
        onClose={() => setIsCustomAuthOpen(false)}
        canClose={Boolean(user)}
      />

      <ShareAppModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />
    </div>
  );
};
