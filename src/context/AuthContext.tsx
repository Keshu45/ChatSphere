import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SafeUser } from '../types/chat';
import { api } from '../lib/api';
import { disconnectSocket } from '../lib/socket';

interface AuthContextType {
  user: SafeUser | null;
  token: string | null;
  isLoading: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updatedUser: SafeUser) => void;
  quickSwitchUser: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('chatsphere_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session on mount
  useEffect(() => {
    async function initSession() {
      const storedToken = localStorage.getItem('chatsphere_token');
      if (storedToken) {
        try {
          const res = await api.auth.getMe();
          setUser(res.user);
          setToken(storedToken);
        } catch (err) {
          console.warn('Session expired, logging out:', err);
          localStorage.removeItem('chatsphere_token');
          setToken(null);
          setUser(null);
        }
      } else {
        setToken(null);
        setUser(null);
      }
      setIsLoading(false);
    }

    initSession();
  }, []);

  const login = useCallback(async (emailOrUsername: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login(emailOrUsername, password);
      localStorage.setItem('chatsphere_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.register(username, email, password);
      localStorage.setItem('chatsphere_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      disconnectSocket();
      localStorage.removeItem('chatsphere_token');
      setToken(null);
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((updatedUser: SafeUser) => {
    setUser(updatedUser);
  }, []);

  const quickSwitchUser = useCallback(async (username: string) => {
    setIsLoading(true);
    disconnectSocket();
    try {
      const res = await api.auth.login(username, 'password123');
      localStorage.setItem('chatsphere_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err) {
      console.error('Failed to quick switch user:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        updateUser,
        quickSwitchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
