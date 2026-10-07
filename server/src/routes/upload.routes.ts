import { Router, Response, NextFunction } from 'express';
import { uploadService } from '../services/upload.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateBody, uploadFileSchema } from '../validation/schemas';
import { AuthenticationError, NotFoundError } from '../utils/errors';
import { verifyToken } from '../utils/jwt';

const router = Router();

// POST /api/v1/uploads - Secure upload endpoint
router.post(
  '/',
  authMiddleware,
  validateBody(uploadFileSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { originalName, mimeType, size, base64Data } = req.body;
      const attachment = await uploadService.processUpload(req.user!.userId, {
        originalName,
        mimeType,
        size,
        base64Data,
      });

      res.status(201).json({
        success: true,
        data: { attachment },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/uploads/:attachmentId - Retrieve attachment metadata with fresh signed URL
router.get(
  '/:attachmentId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const attachment = await uploadService.authorizeAttachmentAccess(
        req.user!.userId,
        req.params.attachmentId
      );

      const formatted = uploadService.formatPublicAttachment(attachment, req.user!.userId);

      res.json({
        success: true,
        data: { attachment: formatted },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/uploads/:attachmentId/signed-url - Generate short-lived signed download URL
router.get(
  '/:attachmentId/signed-url',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const expiresInSeconds = req.query.expiresIn
        ? parseInt(req.query.expiresIn as string, 10)
        : 900;

      const result = await uploadService.getSignedUrl(
        req.user!.userId,
        req.params.attachmentId,
        expiresInSeconds
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/uploads/:attachmentId/download - Secure download & streaming endpoint
router.get(
  '/:attachmentId/download',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { attachmentId } = req.params;
      const signedToken = req.query.token as string | undefined;
      const isInline = req.query.inline === 'true';

      let userId: string | undefined;

      // If signed download token is provided, verify it; otherwise require JWT auth
      if (!signedToken) {
        let jwtToken: string | undefined;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          jwtToken = authHeader.substring(7);
        } else if (req.cookies && (req.cookies.token || req.cookies.auth_token)) {
          jwtToken = req.cookies.token || req.cookies.auth_token;
        } else if (req.query.auth) {
          jwtToken = req.query.auth as string;
        }

        if (!jwtToken) {
          throw new AuthenticationError('Authentication required or signed download token missing');
        }

        const payload = verifyToken(jwtToken);
        if (!payload) {
          throw new AuthenticationError('Invalid or expired authorization token');
        }
        userId = payload.userId;
      }

      const { stream, attachment, actualSize, mimeType } = await uploadService.getAttachmentStream(
        attachmentId,
        userId,
        signedToken
      );

      const resolvedMime = mimeType || attachment.mimeType;
      const resolvedSize = actualSize ?? attachment.size;

      // Determine Content-Disposition
      const disposition = isInline && resolvedMime.startsWith('image/')
        ? 'inline'
        : 'attachment';
      const safeFilename = attachment.safeName || attachment.originalName;

      // Secure HTTP headers
      res.setHeader('Content-Type', resolvedMime);
      if (typeof resolvedSize === 'number') {
        res.setHeader('Content-Length', resolvedSize);
      }
      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(safeFilename)}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, max-age=3600');

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/uploads/:attachmentId/preview - Inline image preview endpoint
router.get(
  '/:attachmentId/preview',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    req.query.inline = 'true';
    const downloadHandler = router.stack.find(
      (layer: any) => layer.route && layer.route.path === '/:attachmentId/download'
    );
    if (downloadHandler) {
      return downloadHandler.handle(req, res, next);
    }
    next(new NotFoundError('Preview handler not found'));
  }
);

export const uploadRoutes = router;
