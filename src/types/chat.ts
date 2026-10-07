export type UserStatus = 'online' | 'offline' | 'away';

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  bio?: string;
  status: UserStatus;
  lastSeenAt: string;
  readReceiptsEnabled: boolean;
  soundEnabled: boolean;
  createdAt: string;
}

export interface AuthSession {
  user: SafeUser;
  token: string;
}

export type ConversationType = 'direct' | 'group';

export type MemberRole = 'admin' | 'member';

export interface ConversationMember {
  userId: string;
  role: MemberRole;
  joinedAt: string;
  lastReadMessageId?: string;
  lastReadAt?: string;
  isMuted?: boolean;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  description?: string;
  avatar?: string;
  createdBy: string;
  members: ConversationMember[];
  lastMessage?: MessagePreview;
  createdAt: string;
  updatedAt: string;
  // Hydrated helper properties for the client
  otherUser?: SafeUser;
  unreadCount?: number;
  isOnline?: boolean;
}

export interface MessagePreview {
  id: string;
  senderId: string;
  senderUsername: string;
  text: string;
  type: MessageType;
  createdAt: string;
}

export type MessageType = 'text' | 'image' | 'file' | 'system';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

export interface MessageReceipt {
  userId: string;
  status: 'delivered' | 'read';
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender?: SafeUser;
  clientMessageId?: string;
  type: MessageType;
  text: string;
  attachments?: MessageAttachment[];
  replyToId?: string;
  replyTo?: {
    id: string;
    senderUsername: string;
    text: string;
  };
  receipts: MessageReceipt[];
  status: MessageDeliveryStatus;
  editedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TypingIndicatorEvent {
  conversationId: string;
  userId: string;
  username: string;
}

export interface PresenceEvent {
  userId: string;
  status: UserStatus;
  lastSeenAt: string;
}

export interface MessageDeliveredEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  updatedAt: string;
}

export interface MessageReadEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  updatedAt: string;
}
