import { z } from 'zod';
import { ValidationError } from '../utils/errors';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);

export function validatePassword(password: string): void {
  if (!password) {
    throw new ValidationError('Password is required');
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new ValidationError(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);
  }
}
