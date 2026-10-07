import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getSocket, disconnectSocket } from '../lib/socket';
import { Message, Conversation, TypingIndicatorEvent, PresenceEvent } from '../types/chat';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUserIds: Set<string>;
  typingUsers: { [conversationId: string]: string[] };
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  emitSendMessage: (payload: {
    conversationId: string;
    text: string;
    type?: 'text' | 'image' | 'file';
    attachments?: any[];
    replyToId?: string;
    clientMessageId?: string;
  }) => Promise<Message>;
  emitTypingStart: (conversationId: string) => void;
  emitTypingStop: (conversationId: string) => void;
  emitMessageDelivered: (conversationId: string, messageId: string) => void;
  emitMessageRead: (conversationId: string, upToMessageId?: string) => void;
  onNewMessage: (handler: (msg: Message) => void) => () => void;
  onMessageDelivered: (handler: (event: { messageId: string; conversationId: string; userId: string }) => void) => () => void;
  onMessageRead: (handler: (event: { conversationId: string; userId: string }) => void) => () => void;
  onConversationUpdated: (handler: (conv: Conversation) => void) => () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<{ [conversationId: string]: string[] }>({});

  const typingTimeoutRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
  if (!token || !user?.id) {
    disconnectSocket();
    setSocket(null);
    setIsConnected(false);
    setOnlineUserIds(new Set());
    setTypingUsers({});
    return;
  }

  const s = getSocket(token);
  setSocket(s);

  function onConnect() {
    setIsConnected(true);

    s.emit('presence:subscribe', (initialOnlineIds: string[]) => {
      if (Array.isArray(initialOnlineIds)) {
        setOnlineUserIds(new Set(initialOnlineIds));
      }
    });
  }

  function onDisconnect() {
    setIsConnected(false);
  }

  function onPresenceUpdate(event: PresenceEvent) {
    setOnlineUserIds(prev => {
      const next = new Set(prev);

      if (event.status === 'online') {
        next.add(event.userId);
      } else {
        next.delete(event.userId);
      }

      return next;
    });
  }

  function onTypingUpdate(
    event: TypingIndicatorEvent & { isTyping: boolean }
  ) {
    const key = `${event.conversationId}:${event.username}`;

    if (event.isTyping) {
      setTypingUsers(prev => {
        const list = prev[event.conversationId] || [];

        if (!list.includes(event.username)) {
          return {
            ...prev,
            [event.conversationId]: [
              ...list,
              event.username
            ]
          };
        }

        return prev;
      });

      if (typingTimeoutRefs.current[key]) {
        clearTimeout(typingTimeoutRefs.current[key]);
      }

      typingTimeoutRefs.current[key] = setTimeout(() => {
        setTypingUsers(prev => ({
          ...prev,
          [event.conversationId]: (
            prev[event.conversationId] || []
          ).filter(u => u !== event.username)
        }));
      }, 4000);

    } else {
      if (typingTimeoutRefs.current[key]) {
        clearTimeout(typingTimeoutRefs.current[key]);
      }

      setTypingUsers(prev => ({
        ...prev,
        [event.conversationId]: (
          prev[event.conversationId] || []
        ).filter(u => u !== event.username)
      }));
    }
  }

  s.on('connect', onConnect);
  s.on('disconnect', onDisconnect);
  s.on('presence:update', onPresenceUpdate);
  s.on('typing:update', onTypingUpdate);

  if (s.connected) {
    onConnect();
  }

  return () => {
    s.off('connect', onConnect);
    s.off('disconnect', onDisconnect);
    s.off('presence:update', onPresenceUpdate);
    s.off('typing:update', onTypingUpdate);
  };

}, [token, user?.id]);

    
   
 

  const joinConversation = useCallback((conversationId: string) => {
    if (socket && socket.connected) {
      socket.emit('conversation:join', conversationId);
    }
  }, [socket]);

  const leaveConversation = useCallback((conversationId: string) => {
    if (socket && socket.connected) {
      socket.emit('conversation:leave', conversationId);
    }
  }, [socket]);

  const emitSendMessage = useCallback((payload: {
    conversationId: string;
    text: string;
    type?: 'text' | 'image' | 'file';
    attachments?: any[];
    replyToId?: string;
    clientMessageId?: string;
  }): Promise<Message> => {
    return new Promise((resolve, reject) => {
      if (!socket || !socket.connected) {
        reject(new Error('Socket disconnected'));
        return;
      }

      let timer: NodeJS.Timeout | null = setTimeout(() => {
        timer = null;
        reject(new Error('Socket acknowledgment timeout'));
      }, 3500);

      socket.emit('message:send', payload, (res: { ok: boolean; message?: Message; error?: string }) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (res && res.ok && res.message) {
          resolve(res.message);
        } else {
          reject(new Error(res?.error || 'Failed to send message via socket'));
        }
      });
    });
  }, [socket]);

  const emitTypingStart = useCallback((conversationId: string) => {
    if (socket && socket.connected) {
      socket.emit('typing:start', conversationId);
    }
  }, [socket]);

  const emitTypingStop = useCallback((conversationId: string) => {
    if (socket && socket.connected) {
      socket.emit('typing:stop', conversationId);
    }
  }, [socket]);

  const emitMessageDelivered = useCallback((conversationId: string, messageId: string) => {
    if (socket && socket.connected) {
      socket.emit('message:delivered', { conversationId, messageId });
    }
  }, [socket]);

  const emitMessageRead = useCallback((conversationId: string, upToMessageId?: string) => {
    if (socket && socket.connected) {
      socket.emit('message:read', { conversationId, upToMessageId });
    }
  }, [socket]);

  const onNewMessage = useCallback((handler: (msg: Message) => void) => {
    if (!socket) return () => {};
    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
    };
  }, [socket]);

  const onMessageDelivered = useCallback((handler: (event: { messageId: string; conversationId: string; userId: string }) => void) => {
    if (!socket) return () => {};
    socket.on('message:delivered', handler);
    return () => {
      socket.off('message:delivered', handler);
    };
  }, [socket]);

  const onMessageRead = useCallback((handler: (event: { conversationId: string; userId: string }) => void) => {
    if (!socket) return () => {};
    socket.on('message:read', handler);
    return () => {
      socket.off('message:read', handler);
    };
  }, [socket]);

  const onConversationUpdated = useCallback((handler: (conv: Conversation) => void) => {
    if (!socket) return () => {};
    socket.on('conversation:updated', handler);
    return () => {
      socket.off('conversation:updated', handler);
    };
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        onlineUserIds,
        typingUsers,
        joinConversation,
        leaveConversation,
        emitSendMessage,
        emitTypingStart,
        emitTypingStop,
        emitMessageDelivered,
        emitMessageRead,
        onNewMessage,
        onMessageDelivered,
        onMessageRead,
        onConversationUpdated,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
