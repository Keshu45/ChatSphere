import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ValidationError, ForbiddenError } from './errors';

// Maximum upload file size: 10MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/zip',
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
]);

// Explicitly prohibited executable file extensions
export const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'bin', 'com', 'vbs', 'msi', 'dll', 'scr',
  'jar', 'apk', 'elf', 'dylib', 'so', 'app', 'deb', 'rpm', 'ps1', 'vbe',
  'wsf', 'wsh', 'reg', 'hta', 'cpl', 'pif', 'gadget', 'msp', 'mst', 'cgi',
  'pl', 'py', 'rb', 'php', 'jsp', 'asp', 'aspx', 'wasm'
]);

// Private Object Storage configuration
export const PRIVATE_STORAGE_DIR = path.resolve(process.cwd(), '.data', 'storage', 'attachments');
export const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT || '';
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'chatsphere-attachments';
export const STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY || '';
export const STORAGE_SECRET_KEY = process.env.STORAGE_SECRET_KEY || '';

// Ensure private object storage directory exists
if (!fs.existsSync(PRIVATE_STORAGE_DIR)) {
  fs.mkdirSync(PRIVATE_STORAGE_DIR, { recursive: true, mode: 0o700 });
}

const SIGNING_SECRET = process.env.JWT_SECRET || 'chatsphere-super-secure-jwt-signing-key-2026';

/**
 * Sanitize filename to prevent directory traversal, control character injection,
 * and dangerous executable naming.
 */
export function sanitizeFilename(originalName: string): { safeName: string; extension: string } {
  if (!originalName || typeof originalName !== 'string') {
    throw new ValidationError('Filename is required and must be a valid string');
  }

  // 1. Path traversal check
  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\') || originalName.includes('\0')) {
    throw new ValidationError('Path traversal or invalid characters detected in filename');
  }

  const baseName = path.basename(originalName).trim();
  if (!baseName || baseName === '.' || baseName === '..') {
    throw new ValidationError('Invalid filename structure');
  }

  // Check all parts of possible multi-part extensions (e.g. exploit.exe.png, payload.sh.txt)
  const segments = baseName.toLowerCase().split('.');
  if (segments.length > 1) {
    for (let i = 1; i < segments.length; i++) {
      const ext = segments[i].trim();
      if (DANGEROUS_EXTENSIONS.has(ext)) {
        throw new ValidationError(`Executable file extension prohibited: .${ext}`);
      }
    }
  }

  const ext = path.extname(baseName).toLowerCase();
  const rawBase = path.basename(baseName, ext);

  // Clean raw base name to strictly safe ASCII alphanumeric, hyphens, and underscores
  const cleanBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, '').substring(0, 15);

  const safeName = (cleanBase || `file_${Date.now()}`) + cleanExt;
  return { safeName, extension: cleanExt };
}

/**
 * Validates file signature (magic bytes) against declared MIME type and checks for executable signatures.
 */
export function validateFileSignature(buffer: Buffer, declaredMimeType: string, originalName: string): void {
  if (!buffer || buffer.length === 0) {
    throw new ValidationError('Uploaded file is empty (0 bytes)');
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new ValidationError(`File size (${buffer.length} bytes) exceeds the 10MB limit`);
  }

  if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
    throw new ValidationError(`Unsupported file type: ${declaredMimeType}. Allowed formats: JPEG, PNG, GIF, WebP, SVG, PDF, Markdown, JSON, plain text, ZIP.`);
  }

  // 1. Executable file signature rejection (independent of declared MIME type)
  // Windows DOS/PE: 'MZ' (0x4D, 0x5A)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new ValidationError('Executable file rejected: Windows executable header (MZ) detected');
  }

  // Linux ELF: 0x7F, 'E', 'L', 'F' (0x7F, 0x45, 0x4C, 0x46)
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    throw new ValidationError('Executable file rejected: Linux ELF binary detected');
  }

  // Java Class / Mach-O Fat: 0xCA, 0xFE, 0xBA, 0xBE
  if (buffer.length >= 4 && buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe) {
    throw new ValidationError('Executable file rejected: Compiled class or Mach-O binary detected');
  }

  // Mach-O binary: 0xFE, 0xED, 0xFA, 0xCE or 0xFE, 0xED, 0xFA, 0xCF or 0xCE, 0xFA, 0xED, 0xFE
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
     (buffer[0] === 0xce && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe))
  ) {
    throw new ValidationError('Executable file rejected: Mach-O binary detected');
  }

  // WebAssembly: \0asm (0x00, 0x61, 0x73, 0x6D)
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x61 && buffer[2] === 0x73 && buffer[3] === 0x6d) {
    throw new ValidationError('Executable file rejected: WebAssembly binary detected');
  }

  // Shell script shebang: '#!' (0x23, 0x21)
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    throw new ValidationError('Executable script rejected: Shell shebang (#!) detected');
  }

  // 2. MIME-specific magic byte verification
  switch (declaredMimeType) {
    case 'image/jpeg': {
      // JPEG starts with 0xFF, 0xD8, 0xFF
      if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        throw new ValidationError('Invalid file signature: Content does not match JPEG image specification');
      }
      break;
    }
    case 'image/png': {
      // PNG starts with 89 50 4E 47 0D 0A 1A 0A
      const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (buffer.length < 8 || !pngHeader.every((b, i) => buffer[i] === b)) {
        throw new ValidationError('Invalid file signature: Content does not match PNG image specification');
      }
      break;
    }
    case 'image/gif': {
      // GIF starts with 'GIF87a' or 'GIF89a'
      const header = buffer.subarray(0, 6).toString('ascii');
      if (header !== 'GIF87a' && header !== 'GIF89a') {
        throw new ValidationError('Invalid file signature: Content does not match GIF specification');
      }
      break;
    }
    case 'image/webp': {
      // RIFF....WEBP
      if (buffer.length < 12) {
        throw new ValidationError('Invalid file signature: Content too short for WebP');
      }
      const riff = buffer.subarray(0, 4).toString('ascii');
      const webp = buffer.subarray(8, 12).toString('ascii');
      if (riff !== 'RIFF' || webp !== 'WEBP') {
        throw new ValidationError('Invalid file signature: Content does not match WebP specification');
      }
      break;
    }
    case 'image/svg+xml': {
      // SVG XML check
      const text = buffer.toString('utf-8');
      if (!text.toLowerCase().includes('<svg')) {
        throw new ValidationError('Invalid file signature: Content does not contain a valid SVG root');
      }
      // Stored XSS defense: SVG must not contain dangerous script elements
      const dangerousSvgPatterns = [
        /<script\b/i,
        /\bon\w+\s*=/i, // inline event handlers e.g. onload=, onerror=
        /javascript\s*:/i,
        /<iframe\b/i,
        /<object\b/i,
        /<embed\b/i,
        /<foreignObject\b/i,
      ];
      for (const pattern of dangerousSvgPatterns) {
        if (pattern.test(text)) {
          throw new ValidationError('SVG file rejected: Unsafe script or executable tags detected');
        }
      }
      break;
    }
    case 'application/pdf': {
      // PDF starts with '%PDF-'
      const header = buffer.subarray(0, 5).toString('ascii');
      if (!header.startsWith('%PDF-')) {
        throw new ValidationError('Invalid file signature: Content does not match PDF document specification');
      }
      break;
    }
    case 'application/zip': {
      // ZIP starts with 'PK\x03\x04', 'PK\x05\x06', or 'PK\x07\x08'
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw new ValidationError('Invalid file signature: Content does not match ZIP archive specification');
      }
      break;
    }
    case 'application/json': {
      try {
        JSON.parse(buffer.toString('utf-8'));
      } catch {
        throw new ValidationError('Invalid file signature: Content is not valid JSON');
      }
      break;
    }
    case 'audio/webm': {
      // EBML ID: 0x1A, 0x45, 0xDF, 0xA3
      if (buffer.length < 4 || buffer[0] !== 0x1a || buffer[1] !== 0x45 || buffer[2] !== 0xdf || buffer[3] !== 0xa3) {
        throw new ValidationError('Invalid file signature: Content does not match WebM audio specification');
      }
      break;
    }
    case 'audio/ogg': {
      // OggS
      if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== 'OggS') {
        throw new ValidationError('Invalid file signature: Content does not match OGG audio specification');
      }
      break;
    }
    case 'audio/wav': {
      // RIFF....WAVE
      if (buffer.length < 12 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
        throw new ValidationError('Invalid file signature: Content does not match WAV audio specification');
      }
      break;
    }
    case 'audio/mpeg': {
      // ID3 or sync frame (0xFF 0xFB/0xFF 0xF3/0xFF 0xF2)
      const hasId3 = buffer.length >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
      const hasSync = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
      if (!hasId3 && !hasSync) {
        throw new ValidationError('Invalid file signature: Content does not match MP3 audio specification');
      }
      break;
    }
    case 'audio/mp4': {
      if (buffer.length < 8 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') {
        throw new ValidationError('Invalid file signature: Content does not match MP4 audio specification');
      }
      break;
    }
    case 'text/plain':
    case 'text/markdown': {
      // Ensure text does not contain excessive binary null bytes
      let nullCount = 0;
      const sampleLength = Math.min(buffer.length, 1024);
      for (let i = 0; i < sampleLength; i++) {
        if (buffer[i] === 0x00) nullCount++;
      }
      if (nullCount > 0) {
        throw new ValidationError('Binary data detected in text file');
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Generates a cryptographically random storage key.
 */
export function generateStorageKey(): string {
  return crypto.randomUUID();
}

/**
 * Computes SHA-256 hash of a file buffer.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Private Object Storage API: Saves buffer to disk in the private directory.
 */
export async function saveToObjectStorage(storageKey: string, buffer: Buffer): Promise<void> {
  const targetPath = path.resolve(PRIVATE_STORAGE_DIR, storageKey);
  if (!targetPath.startsWith(PRIVATE_STORAGE_DIR)) {
    throw new ForbiddenError('Path traversal detected in storage path');
  }

  await fs.promises.writeFile(targetPath, buffer, { mode: 0o600 });
}

/**
 * Private Object Storage API: Reads file stream from disk.
 */
export function getObjectStorageStream(storageKey: string): fs.ReadStream {
  const targetPath = path.resolve(PRIVATE_STORAGE_DIR, storageKey);
  if (!targetPath.startsWith(PRIVATE_STORAGE_DIR)) {
    throw new ForbiddenError('Path traversal detected in storage path');
  }

  if (!fs.existsSync(targetPath)) {
    throw new ValidationError('Storage object file does not exist');
  }

  return fs.createReadStream(targetPath);
}

/**
 * Private Object Storage API: Returns byte size of file on disk if exists.
 */
export function getObjectStorageSize(storageKey: string): number | null {
  const targetPath = path.resolve(PRIVATE_STORAGE_DIR, storageKey);
  if (!targetPath.startsWith(PRIVATE_STORAGE_DIR) || !fs.existsSync(targetPath)) {
    return null;
  }
  try {
    return fs.statSync(targetPath).size;
  } catch {
    return null;
  }
}

/**
 * Private Object Storage API: Checks if file exists on disk.
 */
export function objectStorageExists(storageKey: string): boolean {
  const targetPath = path.resolve(PRIVATE_STORAGE_DIR, storageKey);
  if (!targetPath.startsWith(PRIVATE_STORAGE_DIR)) {
    return false;
  }
  return fs.existsSync(targetPath);
}

/**
 * Private Object Storage API: Deletes file from disk.
 */
export async function deleteFromObjectStorage(storageKey: string): Promise<void> {
  const targetPath = path.resolve(PRIVATE_STORAGE_DIR, storageKey);
  if (targetPath.startsWith(PRIVATE_STORAGE_DIR) && fs.existsSync(targetPath)) {
    await fs.promises.unlink(targetPath);
  }
}

/**
 * Creates a short-lived HMAC-signed download token for an attachment.
 */
export function createSignedDownloadToken(
  attachmentId: string,
  userId: string,
  expiresInSeconds: number = 900 // 15 minutes default
): { token: string; expiresAt: string; expiresInSeconds: number } {
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = {
    attachmentId,
    userId,
    exp: expiresAtEpoch,
    scope: 'attachment_download',
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(payloadString).digest('base64url');
  const token = `${payloadString}.${signature}`;

  return {
    token,
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
    expiresInSeconds,
  };
}

/**
 * Verifies a short-lived HMAC-signed download token.
 */
export function verifySignedDownloadToken(
  token: string,
  expectedAttachmentId: string
): { userId: string; exp: number } {
  if (!token || typeof token !== 'string') {
    throw new ForbiddenError('Missing download signature token');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new ForbiddenError('Malformed signed download token');
  }

  const [payloadString, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SIGNING_SECRET).update(payloadString).digest('base64url');

  if (signature.length !== expectedSignature.length) {
    throw new ForbiddenError('Invalid token signature length');
  }

  const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  if (!isValid) {
    throw new ForbiddenError('Invalid download signature');
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(payloadString, 'base64url').toString('utf-8'));
  } catch {
    throw new ForbiddenError('Invalid download token payload encoding');
  }

  if (payload.scope !== 'attachment_download' || payload.attachmentId !== expectedAttachmentId) {
    throw new ForbiddenError('Token is not valid for this attachment');
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  if (payload.exp < nowEpoch) {
    throw new ForbiddenError('Signed download URL has expired. Please request a fresh signed URL.');
  }

  return { userId: payload.userId, exp: payload.exp };
}
