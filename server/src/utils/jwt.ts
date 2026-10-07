import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'chatsphere-super-secure-production-jwt-secret-2026';
const JWT_EXPIRES_IN = '7d';

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (err) {
    return null;
  }
}
