import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from '../types/chat';
import { api } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';

interface ChatContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingOlder: boolean;
  hasMoreMessages: boolean;
  replyingTo: Message | null;
  editingMessage: Message | null;
  searchQuery: string;
  selectConversation: (conversationId: string | null) => void;
  loadOlderMessages: () => Promise<void>;
  sendMessage: (text: string, attachments?: any[]) => Promise<void>;
  editMessage: (messageId: string, newText: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  setReplyingTo: (msg: Message | null) => void;
  setEditingMessage: (msg: Message | null) => void;
  setSearchQuery: (q: string) => void;
  refreshConversations: () => Promise<void>;
  addNewConversation: (conv: Conversation) => void;
}

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Autoplay policy or unsupported audio environment
  }
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const {
    joinConversation,
    leaveConversation,
    emitSendMessage,
    emitMessageDelivered,
    emitMessageRead,
    onNewMessage,
    onMessageDelivered,
    onMessageRead,
    onConversationUpdated,
  } = useSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);

  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeConvRef = useRef<Conversation | null>(null);
  activeConvRef.current = activeConversation;

  // 1. Fetch user conversations
  const refreshConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setIsLoadingConversations(false);
      return;
    }
    try {
      const res = await api.conversations.list();
      setConversations(res.conversations);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // Clear previous account state immediately upon account change
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setNextCursor(null);
    setHasMoreMessages(false);
    setReplyingTo(null);
    setEditingMessage(null);
    setSearchQuery('');

    if (!user) {
      setIsLoadingConversations(false);
      return;
    }

    refreshConversations();
  }, [user?.id, refreshConversations]);

  // 2. Select Conversation
  const selectConversation = useCallback(async (conversationId: string | null) => {
    if (activeConvRef.current) {
      leaveConversation(activeConvRef.current.id);
    }

    if (!conversationId) {
      setActiveConversation(null);
      setMessages([]);
      setNextCursor(null);
      setHasMoreMessages(false);
      setReplyingTo(null);
      setEditingMessage(null);
      return;
    }

    const found = conversations.find(c => c.id === conversationId);
    if (found) {
      setActiveConversation(found);
    }

    joinConversation(conversationId);
    setIsLoadingMessages(true);
    setReplyingTo(null);
    setEditingMessage(null);

    try {
      const [convRes, msgRes] = await Promise.all([
        api.conversations.getById(conversationId),
        api.messages.getHistory(conversationId, undefined, 30),
      ]);

      setActiveConversation(convRes.conversation);
      setMessages(msgRes.messages);
      setNextCursor(msgRes.nextCursor);
      setHasMoreMessages(msgRes.hasMore);

      // Emit read receipt
      emitMessageRead(conversationId);
      // Reset unread count locally in list
      setConversations(prev =>
        prev.map(c => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Error opening conversation:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [conversations, joinConversation, leaveConversation, emitMessageRead]);

  // 3. Load Older Messages (Pagination)
  const loadOlderMessages = useCallback(async () => {
    if (!activeConversation || !hasMoreMessages || !nextCursor || isLoadingOlder) return;

    setIsLoadingOlder(true);
    try {
      const res = await api.messages.getHistory(activeConversation.id, nextCursor, 30);
      setMessages(prev => [...res.messages, ...prev]);
      setNextCursor(res.nextCursor);
      setHasMoreMessages(res.hasMore);
    } catch (err) {
      console.error('Error loading older messages:', err);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeConversation, hasMoreMessages, nextCursor, isLoadingOlder]);

  // 4. Send Message (with clientMessageId optimistic handling)
  const sendMessage = useCallback(async (text: string, attachments?: any[]) => {
    if (!activeConversation || !user) return;

    const clientMessageId = `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tempReplyTo = replyingTo
      ? {
          id: replyingTo.id,
          senderUsername: replyingTo.sender?.username || 'user',
          text: replyingTo.text,
        }
      : undefined;

    const msgType: 'text' | 'image' | 'file' =
      attachments && attachments.length > 0
        ? attachments[0].mimeType?.startsWith('image/')
          ? 'image'
          : 'file'
        : 'text';

    // Optimistic Message
    const optimisticMessage: Message = {
      id: clientMessageId,
      conversationId: activeConversation.id,
      senderId: user.id,
      sender: user,
      clientMessageId,
      type: msgType,
      text,
      attachments,
      replyToId: replyingTo?.id,
      replyTo: tempReplyTo,
      receipts: [],
      status: 'sending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setReplyingTo(null);

    try {
      const persisted = await emitSendMessage({
        conversationId: activeConversation.id,
        text,
        type: msgType,
        attachments,
        replyToId: optimisticMessage.replyToId,
        clientMessageId,
      });

      // Reconcile optimistic message
      setMessages(prev =>
        prev.map(m => (m.clientMessageId === clientMessageId ? persisted : m))
      );

      // Update last message in list
      setConversations(prev =>
        prev.map(c =>
          c.id === activeConversation.id
            ? {
                ...c,
                lastMessage: {
                  id: persisted.id,
                  senderId: user.id,
                  senderUsername: user.username,
                  text: persisted.text,
                  type: persisted.type,
                  createdAt: persisted.createdAt,
                },
                updatedAt: persisted.createdAt,
              }
            : c
        )
      );
    } catch (err) {
      console.warn('Socket message failed, falling back to REST endpoint:', err);
      try {
        const res = await api.messages.send(activeConversation.id, {
          text,
          type: msgType,
          attachments,
          replyToId: optimisticMessage.replyToId,
          clientMessageId,
        });

        setMessages(prev =>
          prev.map(m => (m.clientMessageId === clientMessageId ? res.message : m))
        );
      } catch (restErr) {
        console.error('Failed to send message via REST fallback:', restErr);
        setMessages(prev =>
          prev.map(m =>
            m.clientMessageId === clientMessageId ? { ...m, status: 'failed' } : m
          )
        );
      }
    }
  }, [activeConversation, user, replyingTo, emitSendMessage]);

  // 5. Edit Message
  const editMessage = useCallback(async (messageId: string, newText: string) => {
    try {
      const res = await api.messages.edit(messageId, newText);
      setMessages(prev => prev.map(m => (m.id === messageId ? res.message : m)));
      setEditingMessage(null);
    } catch (err) {
      console.error('Failed to edit message:', err);
      throw err;
    }
  }, []);

  // 6. Delete Message (Soft delete)
  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      const res = await api.messages.delete(messageId);
      setMessages(prev => prev.map(m => (m.id === messageId ? res.message : m)));
    } catch (err) {
      console.error('Failed to delete message:', err);
      throw err;
    }
  }, []);

  // 7. Subscribe to real-time events from SocketContext
  useEffect(() => {
    const unsubMsg = onNewMessage((newMsg: Message) => {
      const isCurrentConversation = activeConvRef.current?.id === newMsg.conversationId;

      // Play accessible audio notification for incoming messages from others
      if (newMsg.senderId !== user?.id && (user?.soundEnabled ?? true)) {
        playNotificationChime();
      }

      if (isCurrentConversation) {
        setMessages(prev => {
          // Guard against duplicate if optimistic already reconciled
          if (prev.some(m => m.id === newMsg.id || (newMsg.clientMessageId && m.clientMessageId === newMsg.clientMessageId))) {
            return prev.map(m =>
              m.id === newMsg.id || (newMsg.clientMessageId && m.clientMessageId === newMsg.clientMessageId)
                ? newMsg
                : m
            );
          }
          return [...prev, newMsg];
        });

        // If from another user, send read receipt and play notification chime
        if (newMsg.senderId !== user?.id) {
          emitMessageRead(newMsg.conversationId, newMsg.id);
          if (user?.soundEnabled !== false) {
            sound.playReceived();
          }
        }
      } else {
        // Acknowledge delivered
        if (newMsg.senderId !== user?.id) {
          emitMessageDelivered(newMsg.conversationId, newMsg.id);
          if (user?.soundEnabled !== false) {
            sound.playReceived();
          }
        }
      }

      // Update conversations list preview and unread count
      setConversations(prev => {
        const found = prev.find(c => c.id === newMsg.conversationId);
        if (found) {
          return prev.map(c =>
            c.id === newMsg.conversationId
              ? {
                  ...c,
                  lastMessage: {
                    id: newMsg.id,
                    senderId: newMsg.senderId,
                    senderUsername: newMsg.sender?.username || 'user',
                    text: newMsg.text,
                    type: newMsg.type,
                    createdAt: newMsg.createdAt,
                  },
                  unreadCount: isCurrentConversation
                    ? 0
                    : (c.unreadCount || 0) + (newMsg.senderId !== user?.id ? 1 : 0),
                  updatedAt: newMsg.createdAt,
                }
              : c
          );
        } else {
          // New conversation created by someone else
          refreshConversations();
          return prev;
        }
      });
    });

    const unsubDelivered = onMessageDelivered(event => {
      if (activeConvRef.current?.id === event.conversationId) {
        setMessages(prev =>
          prev.map(m => {
            if (m.id === event.messageId) {
              const receipts = [...m.receipts];
              const idx = receipts.findIndex(r => r.userId === event.userId);
              if (idx !== -1) {
                receipts[idx] = { ...receipts[idx], status: 'delivered' };
              } else {
                receipts.push({ userId: event.userId, status: 'delivered', updatedAt: new Date().toISOString() });
              }
              const isMine = m.senderId === user?.id;
              return {
                ...m,
                receipts,
                status: isMine && m.status !== 'read' ? 'delivered' : m.status,
              };
            }
            return m;
          })
        );
      }
    });

    const unsubRead = onMessageRead(event => {
      if (activeConvRef.current?.id === event.conversationId) {
        setMessages(prev =>
          prev.map(m => {
            if (m.senderId === user?.id) {
              const receipts = [...m.receipts];
              const idx = receipts.findIndex(r => r.userId === event.userId);
              if (idx !== -1) {
                receipts[idx] = { ...receipts[idx], status: 'read' };
              } else {
                receipts.push({ userId: event.userId, status: 'read', updatedAt: new Date().toISOString() });
              }
              return {
                ...m,
                receipts,
                status: 'read',
              };
            }
            return m;
          })
        );
      }
    });

    const unsubConvUpdate = onConversationUpdated(updatedConv => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === updatedConv.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedConv };
          return next;
        }
        return [updatedConv, ...prev];
      });

      if (activeConvRef.current?.id === updatedConv.id) {
        setActiveConversation(prev => (prev ? { ...prev, ...updatedConv } : updatedConv));
      }
    });

    return () => {
      unsubMsg();
      unsubDelivered();
      unsubRead();
      unsubConvUpdate();
    };
  }, [
    user,
    onNewMessage,
    onMessageDelivered,
    onMessageRead,
    onConversationUpdated,
    emitMessageRead,
    emitMessageDelivered,
    refreshConversations,
  ]);

  const addNewConversation = useCallback((conv: Conversation) => {
    setConversations(prev => [conv, ...prev.filter(c => c.id !== conv.id)]);
    selectConversation(conv.id);
  }, [selectConversation]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        isLoadingConversations,
        isLoadingMessages,
        isLoadingOlder,
        hasMoreMessages,
        replyingTo,
        editingMessage,
        searchQuery,
        selectConversation,
        loadOlderMessages,
        sendMessage,
        editMessage,
        deleteMessage,
        setReplyingTo,
        setEditingMessage,
        setSearchQuery,
        refreshConversations,
        addNewConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
