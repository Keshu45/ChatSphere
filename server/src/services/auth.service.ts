import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { userRepository } from '../repositories/user.repository';
import { UserDoc } from '../db/storage';
import { SafeUser } from '../../../src/types/chat';
import { signToken } from '../utils/jwt';
import { ValidationError, AuthenticationError, NotFoundError } from '../utils/errors';
import { validatePassword } from '../validation/password';

export class AuthService {
  toSafeUser(user: UserDoc): SafeUser {
    return {
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      status: user.status,
      lastSeenAt: user.lastSeenAt,
      readReceiptsEnabled: user.readReceiptsEnabled ?? true,
      soundEnabled: user.soundEnabled ?? true,
      createdAt: user.createdAt,
    };
  }

  async register(username: string, email: string, password: string): Promise<{ user: SafeUser; token: string }> {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || cleanUsername.length < 3) {
      throw new ValidationError('Username must be at least 3 characters long');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      throw new ValidationError('Username can only contain alphanumeric characters and underscores');
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new ValidationError('Please provide a valid email address');
    }
    validatePassword(password);

    const existingEmail = await userRepository.findByEmail(cleanEmail);
    if (existingEmail) {
      throw new ValidationError('An account with this email address already exists');
    }

    const existingUsername = await userRepository.findByUsername(cleanUsername);
    if (existingUsername) {
      throw new ValidationError('This username is already taken');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const diceBearAvatars = [
      'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(cleanUsername) + '&backgroundColor=6366f1',
      'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(cleanUsername) + '&backgroundColor=06b6d4',
      'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(cleanUsername) + '&backgroundColor=10b981',
      'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(cleanUsername) + '&backgroundColor=ec4899',
    ];
    const avatar = diceBearAvatars[Math.floor(Math.random() * diceBearAvatars.length)];

    const created = await userRepository.create({
      username: cleanUsername,
      usernameNormalized: cleanUsername.toLowerCase(),
      email: cleanEmail,
      emailNormalized: cleanEmail,
      passwordHash,
      avatar,
      bio: 'Member of the ChatSphere community.',
      status: 'online',
      lastSeenAt: new Date().toISOString(),
      readReceiptsEnabled: true,
      soundEnabled: true,
    });

    const safeUser = this.toSafeUser(created);
    const token = signToken({
      userId: safeUser.id,
      username: safeUser.username,
      email: safeUser.email,
    });

    return { user: safeUser, token };
  }

  async login(emailOrUsername: string, password: string): Promise<{ user: SafeUser; token: string }> {
    const rawInput = (emailOrUsername || '').trim();
    if (!rawInput || !password) {
      throw new AuthenticationError('Invalid credentials');
    }

    const cleanInput = rawInput.startsWith('@') ? rawInput.slice(1).trim() : rawInput;

    let user = await userRepository.findByEmail(cleanInput);
    if (!user) {
      user = await userRepository.findByUsername(cleanInput);
    }
    if (!user) {
      const aliasMap: Record<string, string> = {
        alex: 'alex_rivera',
        sam: 'sam_chen',
        elena: 'elena_rostova',
        marcus: 'marcus_vance',
      };
      const mapped = aliasMap[cleanInput.toLowerCase()];
      if (mapped) {
        user = await userRepository.findByUsername(mapped);
      }
    }

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AuthenticationError('Invalid credentials');
    }

    await userRepository.updatePresence(user._id, 'online');
    user.status = 'online';

    const safeUser = this.toSafeUser(user);
    const token = signToken({
      userId: safeUser.id,
      username: safeUser.username,
      email: safeUser.email,
    });

    return { user: safeUser, token };
  }

  async getMe(userId: string): Promise<SafeUser> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return this.toSafeUser(user);
  }

  async requestPasswordReset(email: string): Promise<{ message: string; resetToken?: string }> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return { message: 'If that email exists in our system, password reset instructions have been dispatched.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    await userRepository.update(user._id, {
      resetToken,
      resetTokenExpiry: expiry,
    });

    return {
      message: 'Password reset token generated. Use this single-use token to securely reset your password within 30 minutes.',
      resetToken,
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token) {
      throw new ValidationError('Valid reset token required');
    }
    validatePassword(newPassword);

    const now = new Date().toISOString();
    const user = db.users.find(u => u.resetToken === token && u.resetTokenExpiry && u.resetTokenExpiry > now);

    if (!user) {
      throw new ValidationError('Password reset token is invalid or has expired');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await userRepository.update(user._id, {
      passwordHash,
      resetToken: undefined,
      resetTokenExpiry: undefined,
    });
  }
}

import { db } from '../db/storage';
export const authService = new AuthService();
