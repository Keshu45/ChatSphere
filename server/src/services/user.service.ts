import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/user.repository';
import { authService } from './auth.service';
import { SafeUser } from '../../../src/types/chat';
import { validatePassword } from '../validation/password';
import { ValidationError, NotFoundError } from '../utils/errors';

export class UserService {
  async getUser(id: string): Promise<SafeUser | null> {
    const user = await userRepository.findById(id);
    return user ? authService.toSafeUser(user) : null;
  }

  async searchUsers(query: string, excludeUserId: string): Promise<SafeUser[]> {
    const results = await userRepository.searchUsers(query, excludeUserId);
    return results.map(u => authService.toSafeUser(u));
  }

  async listUsers(excludeUserId: string): Promise<SafeUser[]> {
    const results = await userRepository.listUsers(excludeUserId);
    return results.map(u => authService.toSafeUser(u));
  }

  async updateProfile(
    userId: string,
    updates: {
      bio?: string;
      avatar?: string;
      soundEnabled?: boolean;
      readReceiptsEnabled?: boolean;
    }
  ): Promise<SafeUser> {
    const updated = await userRepository.update(userId, updates);
    if (!updated) {
      throw new NotFoundError('User not found');
    }
    return authService.toSafeUser(updated);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      throw new ValidationError('Current password is incorrect');
    }

    validatePassword(newPassword);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    await userRepository.update(userId, { passwordHash });
  }
}

export const userService = new UserService();
