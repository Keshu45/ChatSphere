import { Socket } from 'socket.io';
import { verifyToken, TokenPayload } from '../utils/jwt';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: TokenPayload;
  };
}

export function socketAuthMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication failed: Missing token'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Authentication failed: Invalid or expired token'));
    }

    socket.data.user = payload;
    next();
  } catch (err: any) {
    next(new Error('Socket authentication error'));
  }
}
