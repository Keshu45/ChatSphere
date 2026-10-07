import { AuthSession, Conversation, Message, MessageAttachment, SafeUser } from '../types/chat';

const API_BASE = '/api/v1';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    requestId?: string;
  };
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('chatsphere_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers = new Headers(options.headers || {});

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      payload = { error: { message: response.statusText || 'Network error' } };
    }

    if (!response.ok || payload.success === false) {
      const errorMsg =
        payload.error?.message ||
        payload.error ||
        payload.message ||
        `HTTP Error ${response.status}: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    // If response matches standardized envelope { success: true, data: ... }
    if (payload && payload.success === true && 'data' in payload) {
      return payload.data as T;
    }

    return payload as T;
  }

  // Auth endpoints
  auth = {
    register: (username: string, email: string, password: string) =>
      this.request<AuthSession>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),

    login: (emailOrUsername: string, password: string) =>
      this.request<AuthSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ emailOrUsername, password }),
      }),

    logout: () =>
      this.request<{ message: string }>('/auth/logout', {
        method: 'POST',
      }),

    getMe: () =>
      this.request<{ user: SafeUser }>('/auth/me'),

    forgotPassword: (email: string) =>
      this.request<{ message: string; resetToken?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    resetPassword: (token: string, newPassword: string) =>
      this.request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      }),
  };

  // User endpoints
  users = {
    list: () =>
      this.request<{ users: SafeUser[] }>('/users'),

    search: (query?: string) =>
      this.request<{ users: SafeUser[] }>(`/users${query ? `?q=${encodeURIComponent(query)}` : ''}`),

    getById: (id: string) =>
      this.request<{ user: SafeUser }>(`/users/${id}`),

    updateProfile: (data: { bio?: string; avatar?: string; soundEnabled?: boolean; readReceiptsEnabled?: boolean }) =>
      this.request<{ user: SafeUser }>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    changePassword: (oldPassword: string, newPassword: string) =>
      this.request<{ message: string }>('/users/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      }),
  };

  // Conversation endpoints
  conversations = {
    list: () =>
      this.request<{ conversations: Conversation[] }>('/conversations'),

    getById: (id: string) =>
      this.request<{ conversation: Conversation }>(`/conversations/${id}`),

    createDirect: (targetUserId: string) =>
      this.request<{ conversation: Conversation }>('/conversations/direct', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      }),

    createGroup: (name: string, description: string, memberIds: string[]) =>
      this.request<{ conversation: Conversation }>('/conversations/group', {
        method: 'POST',
        body: JSON.stringify({ name, description, memberIds }),
      }),

    updateGroup: (id: string, data: { name?: string; description?: string; avatar?: string }) =>
      this.request<{ conversation: Conversation }>(`/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    addMembers: (id: string, memberIds: string[]) =>
      this.request<{ conversation: Conversation }>(`/conversations/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ memberIds }),
      }),

    removeMember: (id: string, memberId: string) =>
      this.request<{ conversation: Conversation }>(`/conversations/${id}/members/${memberId}`, {
        method: 'DELETE',
      }),

    markRead: (id: string, upToMessageId?: string) =>
      this.request<{ updatedCount: number }>(`/conversations/${id}/read`, {
        method: 'POST',
        body: JSON.stringify({ upToMessageId }),
      }),
  };

  // Message endpoints
  messages = {
    getHistory: (conversationId: string, cursor?: string, limit: number = 30) =>
      this.request<{ messages: Message[]; nextCursor: string | null; hasMore: boolean }>(
        `/conversations/${conversationId}/messages?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`
      ),

    send: (conversationId: string, payload: {
      text: string;
      type?: 'text' | 'image' | 'file';
      attachments?: any[];
      replyToId?: string;
      clientMessageId?: string;
    }) =>
      this.request<{ message: Message }>(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    edit: (messageId: string, text: string) =>
      this.request<{ message: Message }>(`/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text }),
      }),

    delete: (messageId: string) =>
      this.request<{ message: Message }>(`/messages/${messageId}`, {
        method: 'DELETE',
      }),

    search: (conversationId: string, query: string) =>
      this.request<{ messages: Message[] }>(
        `/search/messages?conversationId=${encodeURIComponent(conversationId)}&q=${encodeURIComponent(query)}`
      ),
  };

  // Upload endpoints
  uploads = {
    upload: (fileData: { originalName: string; mimeType: string; size: number; base64Data: string }) =>
      this.request<{ attachment: MessageAttachment }>('/uploads', {
        method: 'POST',
        body: JSON.stringify(fileData),
      }),

    getById: (attachmentId: string) =>
      this.request<{ attachment: MessageAttachment }>(`/uploads/${attachmentId}`),
  };

  // Search endpoints
  search = {
    users: (q: string) =>
      this.request<{ users: SafeUser[] }>(`/search/users?q=${encodeURIComponent(q)}`),

    messages: (conversationId: string, q: string) =>
      this.request<{ messages: Message[] }>(
        `/search/messages?conversationId=${encodeURIComponent(conversationId)}&q=${encodeURIComponent(query(q))}`
      ),
  };
}

function query(str: string): string {
  return str;
}

export const api = new ApiClient();
