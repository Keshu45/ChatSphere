import { userRepository } from '../repositories/user.repository';

class PresenceService {
  // userId -> Set of active socket IDs
  private userSockets: Map<string, Set<string>> = new Map();
  // socketId -> userId
  private socketToUser: Map<string, string> = new Map();

  userConnected(userId: string, socketId: string): { isFirstConnection: boolean } {
    let sockets = this.userSockets.get(userId);
    const isFirstConnection = !sockets || sockets.size === 0;

    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    this.socketToUser.set(socketId, userId);

    if (isFirstConnection) {
      userRepository.updatePresence(userId, 'online').catch(err => {
        console.error('Error updating presence online:', err);
      });
    }

    return { isFirstConnection };
  }

  userDisconnected(socketId: string): { userId?: string; isLastConnection: boolean } {
    const userId = this.socketToUser.get(socketId);
    if (!userId) {
      return { isLastConnection: false };
    }

    this.socketToUser.delete(socketId);
    const sockets = this.userSockets.get(userId);

    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        userRepository.updatePresence(userId, 'offline').catch(err => {
          console.error('Error updating presence offline:', err);
        });
        return { userId, isLastConnection: true };
      }
    }

    return { userId, isLastConnection: false };
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.userSockets.keys());
  }

  getUserSocketIds(userId: string): string[] {
    const sockets = this.userSockets.get(userId);
    return sockets ? Array.from(sockets) : [];
  }
}

export const presenceService = new PresenceService();
