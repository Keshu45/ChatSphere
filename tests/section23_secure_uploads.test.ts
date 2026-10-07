import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRoutes } from '../server/src/routes/auth.routes';
import { conversationRoutes } from '../server/src/routes/conversation.routes';
import { messageRoutes } from '../server/src/routes/message.routes';
import { uploadRoutes } from '../server/src/routes/upload.routes';
import { errorHandler } from '../server/src/middleware/error.middleware';
import { requestIdMiddleware } from '../server/src/middleware/requestId.middleware';
import { PRIVATE_STORAGE_DIR } from '../server/src/utils/fileSecurity';
import { db } from '../server/src/db/storage';

describe('Section 23: Secure File and Image Uploads Audit & Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let uploaderToken: string;
  let uploaderId: string;

  let recipientToken: string;
  let recipientId: string;

  let unauthorizedToken: string;
  let unauthorizedId: string;

  let conversationId: string;
  let uploadedAttachmentId: string;
  let validSignedUrl: string;

  before(async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(cors({ origin: true, credentials: true }));
    app.use(cookieParser());
    app.use(express.json({ limit: '25mb' }));

    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/conversations', conversationRoutes);
    app.use('/api/v1/messages', messageRoutes);
    app.use('/api/v1/uploads', uploadRoutes);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(3038, resolve));
    baseUrl = 'http://localhost:3038';

    // Register User 1 (Uploader)
    const res1 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `uploader_${Date.now()}`,
        email: `uploader_${Date.now()}@example.com`,
        password: 'Password123!',
      }),
    });
    const d1 = await res1.json();
    uploaderToken = d1.data.token;
    uploaderId = d1.data.user.id;

    // Register User 2 (Recipient / Conversation Member)
    const res2 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `recipient_${Date.now()}`,
        email: `recipient_${Date.now()}@example.com`,
        password: 'Password123!',
      }),
    });
    const d2 = await res2.json();
    recipientToken = d2.data.token;
    recipientId = d2.data.user.id;

    // Register User 3 (Unauthorized Outsider)
    const res3 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `outsider_${Date.now()}`,
        email: `outsider_${Date.now()}@example.com`,
        password: 'Password123!',
      }),
    });
    const d3 = await res3.json();
    unauthorizedToken = d3.data.token;
    unauthorizedId = d3.data.user.id;

    // Create Direct Conversation between User 1 and User 2
    const convRes = await fetch(`${baseUrl}/api/v1/conversations/direct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({ targetUserId: recipientId }),
    });
    const convData = await convRes.json();
    conversationId = convData.data.conversation.id;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // 1. File size limit enforcement
  it('1. Rejects empty uploads (0 bytes) and payloads exceeding 10MB limit', async () => {
    // Empty file
    const emptyRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'empty.png',
        mimeType: 'image/png',
        size: 0,
        base64Data: '',
      }),
    });
    assert.equal(emptyRes.status, 400);

    // Exceeding 10MB limit (10MB + 1KB)
    const oversizeRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'huge.png',
        mimeType: 'image/png',
        size: 11 * 1024 * 1024,
        base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }),
    });
    assert.equal(oversizeRes.status, 400);
  });

  // 2. MIME type whitelist enforcement
  it('2. Enforces allowed MIME types and rejects unsupported formats', async () => {
    const invalidMimeRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'clip.mp4',
        mimeType: 'video/mp4',
        size: 1024,
        base64Data: Buffer.from('fake mp4 video bytes here').toString('base64'),
      }),
    });
    assert.equal(invalidMimeRes.status, 400);
    const json = await invalidMimeRes.json();
    assert.match(json.error.message, /Unsupported file type/);
  });

  // 3. File signature (magic bytes) validation
  it('3. Validates file signatures and rejects mismatched magic bytes', async () => {
    // Declared as image/png, but contains random ASCII text
    const spoofedRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'fake.png',
        mimeType: 'image/png',
        size: 32,
        base64Data: Buffer.from('This is not a real PNG file at all!').toString('base64'),
      }),
    });
    assert.equal(spoofedRes.status, 400);
    const json = await spoofedRes.json();
    assert.match(json.error.message, /Invalid file signature/);
  });

  // 4. Executable file rejection (signatures & extensions)
  it('4. Strictly rejects executable files by extension and binary headers', async () => {
    // Executable by extension (.exe)
    const exeRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'malware.exe',
        mimeType: 'application/octet-stream',
        size: 1024,
        base64Data: Buffer.from('MZdummy').toString('base64'),
      }),
    });
    assert.equal(exeRes.status, 400);

    // Double extension bypass attempt (e.g. invoice.pdf.exe)
    const doubleExtRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'invoice.pdf.exe',
        mimeType: 'application/pdf',
        size: 1024,
        base64Data: Buffer.from('%PDF-1.4 fake pdf').toString('base64'),
      }),
    });
    assert.equal(doubleExtRes.status, 400);

    // Executable disguised as PNG with MZ header
    const disguisedExeBuffer = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(100)]);
    const disguisedExeRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'safe_looking.png',
        mimeType: 'image/png',
        size: disguisedExeBuffer.length,
        base64Data: disguisedExeBuffer.toString('base64'),
      }),
    });
    assert.equal(disguisedExeRes.status, 400);
    const disguisedJson = await disguisedExeRes.json();
    assert.match(disguisedJson.error.message, /Executable file rejected/);

    // Linux ELF executable header
    const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01]);
    const elfRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'binary.pdf',
        mimeType: 'application/pdf',
        size: elfBuffer.length,
        base64Data: elfBuffer.toString('base64'),
      }),
    });
    assert.equal(elfRes.status, 400);

    // Shell script shebang (#!)
    const shebangBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
    const shebangRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'script.txt',
        mimeType: 'text/plain',
        size: shebangBuffer.length,
        base64Data: shebangBuffer.toString('base64'),
      }),
    });
    assert.equal(shebangRes.status, 400);
    const shebangJson = await shebangRes.json();
    assert.match(shebangJson.error.message, /Executable script rejected/);
  });

  // 5. Path traversal protection in filenames
  it('5. Protects against directory traversal sequences in original filenames', async () => {
    // Valid PNG 1x1 buffer
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const traversalRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: '../../../../etc/passwd.png',
        mimeType: 'image/png',
        size: validPngBuffer.length,
        base64Data: validPngBuffer.toString('base64'),
      }),
    });
    // Rejected due to path traversal characters
    assert.equal(traversalRes.status, 400);
  });

  // 6. Valid file upload, random storage keys, and private object storage
  it('6. Successfully uploads valid file to private object storage and generates signed URL', async () => {
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const uploadRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'Quarterly_Report_2026.png',
        mimeType: 'image/png',
        size: validPngBuffer.length,
        base64Data: validPngBuffer.toString('base64'),
      }),
    });

    assert.equal(uploadRes.status, 201);
    const uploadData = await uploadRes.json();
    assert.equal(uploadData.success, true);
    assert.ok(uploadData.data.attachment.id);
    assert.equal(uploadData.data.attachment.originalName, 'Quarterly_Report_2026.png');
    assert.ok(uploadData.data.attachment.url.includes('/api/v1/uploads/'));
    assert.ok(uploadData.data.attachment.url.includes('token='));

    uploadedAttachmentId = uploadData.data.attachment.id;
    validSignedUrl = uploadData.data.attachment.url;

    // Verify storage key is NOT exposed to client
    assert.equal(uploadData.data.attachment.storageKey, undefined);
    assert.equal(uploadData.data.attachment.filePath, undefined);

    // Verify that the file was written to private object storage on disk
    const attDoc = db.getAttachmentById(uploadedAttachmentId);
    assert.ok(attDoc);
    assert.ok(attDoc.storageKey);
    // UUID format check
    assert.match(
      attDoc.storageKey,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    const physicalPath = path.join(PRIVATE_STORAGE_DIR, attDoc.storageKey);
    assert.ok(fs.existsSync(physicalPath));
    const diskContent = fs.readFileSync(physicalPath);
    assert.equal(diskContent.length, validPngBuffer.length);

    // Verify large file is NOT stored directly inside MongoDB / JSON database
    assert.equal(attDoc.dataUrl, undefined);
  });

  // 7. Signed download URLs: creation and verification
  it('7. Generates short-lived signed URLs and allows authorized download via token', async () => {
    // Generate signed URL explicitly
    const signedUrlRes = await fetch(
      `${baseUrl}/api/v1/uploads/${uploadedAttachmentId}/signed-url?expiresIn=300`,
      {
        headers: { Authorization: `Bearer ${uploaderToken}` },
      }
    );
    assert.equal(signedUrlRes.status, 200);
    const signedData = await signedUrlRes.json();
    assert.equal(signedData.success, true);
    assert.ok(signedData.data.signedUrl);
    assert.ok(signedData.data.expiresAt);
    assert.equal(signedData.data.expiresInSeconds, 300);

    // Download file using the signed URL (no auth header needed!)
    const downloadRes = await fetch(`${baseUrl}${signedData.data.signedUrl}`);
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers.get('content-type'), 'image/png');
    assert.equal(downloadRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(downloadRes.headers.get('x-frame-options'), 'DENY');
    assert.ok(downloadRes.headers.get('content-security-policy'));

    const arrayBuffer = await downloadRes.arrayBuffer();
    assert.ok(arrayBuffer.byteLength > 0);
  });

  // 8. Rejects tampered or expired signed tokens
  it('8. Rejects tampered or malformed signed download tokens', async () => {
    // Tampered signature
    const tamperedUrl = `${baseUrl}/api/v1/uploads/${uploadedAttachmentId}/download?token=eyJhdHRhY2htZW50SWQiOiJmYWtlIn0.invalidsignature`;
    const tamperedRes = await fetch(tamperedUrl);
    assert.equal(tamperedRes.status, 403);

    // Missing token and missing auth
    const noAuthRes = await fetch(`${baseUrl}/api/v1/uploads/${uploadedAttachmentId}/download`);
    assert.equal(noAuthRes.status, 401);
  });

  // 9. Authorization enforcement: uploader vs conversation member vs unauthorized outsider
  it('9. Enforces conversation authorization: allows conversation member, rejects outsider', async () => {
    // Before sending in conversation: Outsider tries to access attachment -> 403 Forbidden
    const outsiderRes = await fetch(`${baseUrl}/api/v1/uploads/${uploadedAttachmentId}`, {
      headers: { Authorization: `Bearer ${unauthorizedToken}` },
    });
    assert.equal(outsiderRes.status, 403);

    const outsiderDownloadRes = await fetch(
      `${baseUrl}/api/v1/uploads/${uploadedAttachmentId}/download`,
      {
        headers: { Authorization: `Bearer ${unauthorizedToken}` },
      }
    );
    assert.equal(outsiderDownloadRes.status, 403);

    // Uploader posts a message with the attachment to the conversation with recipient
    const sendMsgRes = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        text: 'Here is the quarterly report diagram',
        type: 'image',
        attachments: [
          {
            id: uploadedAttachmentId,
            originalName: 'Quarterly_Report_2026.png',
            mimeType: 'image/png',
            size: 512,
            url: `/api/v1/uploads/${uploadedAttachmentId}/download`,
          },
        ],
      }),
    });
    assert.equal(sendMsgRes.status, 201);

    // Recipient (member of conversation) can now retrieve and download the attachment!
    const recipientRes = await fetch(`${baseUrl}/api/v1/uploads/${uploadedAttachmentId}`, {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(recipientRes.status, 200);

    const recipientDownloadRes = await fetch(
      `${baseUrl}/api/v1/uploads/${uploadedAttachmentId}/download`,
      {
        headers: { Authorization: `Bearer ${recipientToken}` },
      }
    );
    assert.equal(recipientDownloadRes.status, 200);
    assert.equal(recipientDownloadRes.headers.get('content-type'), 'image/png');

    // Outsider (not in conversation) is STILL forbidden!
    const outsiderStillBlocked = await fetch(
      `${baseUrl}/api/v1/uploads/${uploadedAttachmentId}/download`,
      {
        headers: { Authorization: `Bearer ${unauthorizedToken}` },
      }
    );
    assert.equal(outsiderStillBlocked.status, 403);
  });

  // 10. Document formats (PDF & Markdown)
  it('10. Correctly handles valid documents (PDF, Markdown, JSON) and validates their signatures', async () => {
    // Valid PDF upload
    const validPdfHeader = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const pdfRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'specification.pdf',
        mimeType: 'application/pdf',
        size: validPdfHeader.length,
        base64Data: validPdfHeader.toString('base64'),
      }),
    });
    assert.equal(pdfRes.status, 201);
    const pdfJson = await pdfRes.json();
    assert.equal(pdfJson.data.attachment.mimeType, 'application/pdf');

    // Valid Markdown upload
    const mdBuffer = Buffer.from('# Architecture Guide\n\nThis is secure file storage documentation.');
    const mdRes = await fetch(`${baseUrl}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uploaderToken}`,
      },
      body: JSON.stringify({
        originalName: 'notes.md',
        mimeType: 'text/markdown',
        size: mdBuffer.length,
        base64Data: mdBuffer.toString('base64'),
      }),
    });
    assert.equal(mdRes.status, 201);
  });
});
