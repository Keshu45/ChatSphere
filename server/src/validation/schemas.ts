import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import { passwordSchema } from './password';

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  email: z.string().trim().email('Please provide a valid email address'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  emailOrUsername: z.string().trim().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Valid email address required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Valid reset token required'),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
  avatar: z.string().url('Avatar must be a valid URL').or(z.string().startsWith('data:image')).or(z.string().length(0)).optional(),
  readReceiptsEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const createConversationSchema = z.object({
  type: z.enum(['direct', 'group']).default('direct'),
  targetUserId: z.string().min(1, 'targetUserId is required for direct conversations').optional(),
  name: z.string().min(1, 'Channel name is required for groups').max(100).optional(),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1, 'Channel name cannot be empty').max(100).optional(),
  description: z.string().max(500).optional(),
  avatar: z.string().optional(),
});

export const addMembersSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1, 'At least one member ID is required'),
});

export const sendMessageSchema = z.object({
  text: z.string().max(5000, 'Message cannot exceed 5000 characters').default(''),
  type: z.enum(['text', 'image', 'file', 'system']).default('text'),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        originalName: z.string(),
        mimeType: z.string(),
        size: z.number().max(10 * 1024 * 1024, 'Attachment exceeds 10MB'),
        url: z.string(),
        thumbnailUrl: z.string().optional(),
      })
    )
    .optional(),
  replyToId: z.string().optional(),
  clientMessageId: z.string().optional(),
}).refine(data => data.text.trim().length > 0 || (data.attachments && data.attachments.length > 0), {
  message: 'Message must have text content or at least one attachment',
});

export const editMessageSchema = z.object({
  text: z.string().min(1, 'Message text cannot be empty').max(5000, 'Message cannot exceed 5000 characters'),
});

export const uploadFileSchema = z.object({
  originalName: z.string().min(1, 'Original filename is required').max(255, 'Filename cannot exceed 255 characters'),
  mimeType: z.string().min(1, 'MIME type is required'),
  size: z.number().min(1, 'File cannot be empty').max(10 * 1024 * 1024, 'File exceeds 10MB limit'),
  base64Data: z.string().min(1, 'File data is required'),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// Middleware helper
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map((e: any) => e.message).join('; ');
      return next(new ValidationError(messages));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const messages = result.error.issues.map((e: any) => e.message).join('; ');
      return next(new ValidationError(messages));
    }
    req.query = result.data as any;
    next();
  };
}
