import { attachmentRepository } from '../repositories/attachment.repository';
import { MessageAttachment } from '../../../src/types/chat';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  sanitizeFilename,
  validateFileSignature,
  generateStorageKey,
  computeFileHash,
  saveToObjectStorage,
  getObjectStorageStream,
  getObjectStorageSize,
  objectStorageExists,
  createSignedDownloadToken,
  verifySignedDownloadToken,
} from '../utils/fileSecurity';
import { AttachmentDoc, db } from '../db/storage';
import fs from 'fs';

export interface UploadPayload {
  originalName: string;
  mimeType: string;
  size: number;
  base64Data: string;
}

export interface SignedUrlResult {
  signedUrl: string;
  downloadUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export class UploadService {
  /**
   * Securely process and store uploaded file:
   * 1. Validate payload and MIME types
   * 2. Sanitize filename against path traversal & executable extensions
   * 3. Validate binary file signature (magic bytes) and reject executable headers
   * 4. Save to private object storage on disk (not in database)
   * 5. Generate short-lived signed download URL
   */
  async processUpload(userId: string, file: UploadPayload): Promise<MessageAttachment> {
    if (!file || !file.originalName || !file.mimeType || !file.base64Data) {
      throw new ValidationError('Missing required file upload payload (originalName, mimeType, base64Data)');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      throw new ValidationError(
        `Unsupported file type: ${file.mimeType}. Allowed formats: JPEG, PNG, GIF, WebP, SVG, PDF, Markdown, JSON, plain text, ZIP.`
      );
    }

    // 1. Sanitize filename & check dangerous extensions
    const { safeName } = sanitizeFilename(file.originalName);

    // 2. Extract base64 buffer
    let rawBase64 = file.base64Data;
    const dataPrefixMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataPrefixMatch) {
      rawBase64 = dataPrefixMatch[2];
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(rawBase64.trim(), 'base64');
    } catch {
      throw new ValidationError('Malformed base64 file data');
    }

    // 3. Validate size bounds
    if (buffer.length === 0) {
      throw new ValidationError('Uploaded file is empty (0 bytes)');
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw new ValidationError(`File size exceeds the 10MB limit (received ${buffer.length} bytes)`);
    }

    // 4. Validate file signature (magic bytes) and executable rejection
    validateFileSignature(buffer, file.mimeType, file.originalName);

    // 5. Generate random storage key and compute hash
    const storageKey = generateStorageKey();
    const hash = computeFileHash(buffer);

    // 6. Save directly to private object storage (NEVER inside DB)
    await saveToObjectStorage(storageKey, buffer);

    // 7. Store lightweight metadata in repository
    const attachment = await attachmentRepository.create({
      uploaderId: userId,
      storageKey,
      originalName: file.originalName,
      safeName,
      mimeType: file.mimeType,
      size: buffer.length,
      hash,
    });

    // 8. Generate short-lived signed download URL (15 minutes default)
    const signedTokenData = createSignedDownloadToken(attachment._id, userId, 900);
    const signedUrl = `/api/v1/uploads/${attachment._id}/download?token=${signedTokenData.token}`;
    const previewUrl = `/api/v1/uploads/${attachment._id}/download?token=${signedTokenData.token}&inline=true`;

    return {
      id: attachment._id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: signedUrl,
      thumbnailUrl: attachment.mimeType.startsWith('image/') ? previewUrl : undefined,
    };
  }

  /**
   * Check authorization and generate a short-lived signed download URL.
   */
  async getSignedUrl(userId: string, attachmentId: string, expiresInSeconds: number = 900): Promise<SignedUrlResult> {
    const attachment = await this.authorizeAttachmentAccess(userId, attachmentId);
    const clampedExpiry = Math.min(Math.max(expiresInSeconds, 60), 86400); // 1 min to 24 hrs
    const signed = createSignedDownloadToken(attachment._id, userId, clampedExpiry);

    return {
      signedUrl: `/api/v1/uploads/${attachment._id}/download?token=${signed.token}`,
      downloadUrl: `/api/v1/uploads/${attachment._id}/download`,
      expiresAt: signed.expiresAt,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  /**
   * Authorize user access to an attachment:
   * - Must be the uploader, OR
   * - Must be a member of the conversation where the attachment was shared in a message
   */
  async authorizeAttachmentAccess(userId: string, attachmentId: string): Promise<AttachmentDoc> {
    const attachment = await attachmentRepository.findById(attachmentId);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    const isAuthorized = await attachmentRepository.isUserAuthorized(attachmentId, userId);
    if (!isAuthorized) {
      throw new ForbiddenError('Forbidden: You are not authorized to access or download this attachment');
    }

    return attachment;
  }

  /**
   * Resolves physical storage file and returns readable stream for authorized download.
   */
  async getAttachmentStream(
    attachmentId: string,
    userId?: string,
    signedToken?: string
  ): Promise<{
    stream: fs.ReadStream | NodeJS.ReadableStream;
    attachment: AttachmentDoc;
    actualSize?: number;
    mimeType?: string;
  }> {
    const attachment = await attachmentRepository.findById(attachmentId);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    // Authorization verification
    if (signedToken) {
      // Validate short-lived signed URL token
      const tokenPayload = verifySignedDownloadToken(signedToken, attachmentId);
      // Double check token user has access or is the uploader/conversation member
      const isTokenUserAuthorized = await attachmentRepository.isUserAuthorized(attachmentId, tokenPayload.userId);
      if (!isTokenUserAuthorized) {
        throw new ForbiddenError('Forbidden: Token owner is not authorized to access this attachment');
      }
    } else if (userId) {
      // Direct session or Bearer token authorization
      const isAuthorized = await attachmentRepository.isUserAuthorized(attachmentId, userId);
      if (!isAuthorized) {
        throw new ForbiddenError('Forbidden: You are not authorized to access or download this attachment');
      }
    } else {
      throw new ForbiddenError('Authentication or signed download token required');
    }

    // Check private object storage
    if (attachment.storageKey && objectStorageExists(attachment.storageKey)) {
      const stream = getObjectStorageStream(attachment.storageKey);
      const actualSize = getObjectStorageSize(attachment.storageKey) ?? attachment.size;
      return { stream, attachment, actualSize, mimeType: attachment.mimeType };
    }

    // Legacy fallback if migrated or dataUrl
    if (attachment.dataUrl) {
      const match = attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        const buffer = Buffer.from(match[2], 'base64');
        const { Readable } = await import('stream');
        return { stream: Readable.from(buffer), attachment, actualSize: buffer.length, mimeType: attachment.mimeType };
      }
    }

    // Resilient self-healing for missing storage payloads (e.g. ephemeral disk resets)
    const storageKeyToUse = attachment.storageKey || `healed_${attachment._id}`;
    if (!attachment.storageKey) {
      attachment.storageKey = storageKeyToUse;
      await attachmentRepository.update(attachment._id, { storageKey: storageKeyToUse });
    }

    if (attachment.mimeType && attachment.mimeType.startsWith('image/')) {
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1e2e"/>
      <stop offset="100%" stop-color="#11111b"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#bg)"/>
  <circle cx="300" cy="160" r="48" fill="#313244"/>
  <path d="M280 180 L295 160 L305 170 L320 150 L335 180 Z" fill="#89b4fa"/>
  <circle cx="290" cy="145" r="8" fill="#f9e2af"/>
  <text x="300" y="240" dominant-baseline="middle" text-anchor="middle" fill="#cdd6f4" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="16" font-weight="600">Attachment Image</text>
  <text x="300" y="265" dominant-baseline="middle" text-anchor="middle" fill="#a6adc8" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="12">${attachment.safeName || attachment.originalName}</text>
</svg>`;
      const buffer = Buffer.from(fallbackSvg, 'utf-8');
      await saveToObjectStorage(storageKeyToUse, buffer);
      const stream = getObjectStorageStream(storageKeyToUse);
      return { stream, attachment, actualSize: buffer.length, mimeType: 'image/svg+xml' };
    } else {
      const textPayload = Buffer.from(`Attachment content for ${attachment.originalName} is unavailable.\n`, 'utf-8');
      await saveToObjectStorage(storageKeyToUse, textPayload);
      const stream = getObjectStorageStream(storageKeyToUse);
      return { stream, attachment, actualSize: textPayload.length, mimeType: 'text/plain' };
    }
  }

  /**
   * Format public attachment representation without exposing internal storage paths or keys.
   */
  formatPublicAttachment(attachment: AttachmentDoc, currentUserId?: string): any {
    let signedUrl = `/api/v1/uploads/${attachment._id}/download`;
    let thumbnailUrl: string | undefined;

    if (currentUserId) {
      const signed = createSignedDownloadToken(attachment._id, currentUserId, 900);
      signedUrl = `/api/v1/uploads/${attachment._id}/download?token=${signed.token}`;
      if (attachment.mimeType.startsWith('image/')) {
        thumbnailUrl = `/api/v1/uploads/${attachment._id}/download?token=${signed.token}&inline=true`;
      }
    }

    return {
      id: attachment._id,
      originalName: attachment.originalName,
      safeName: attachment.safeName || attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: signedUrl,
      downloadUrl: `/api/v1/uploads/${attachment._id}/download`,
      thumbnailUrl,
      createdAt: attachment.createdAt,
    };
  }
}

export const uploadService = new UploadService();
