import { Router, Response, NextFunction } from 'express';
import { messageService } from '../services/message.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateBody, validateQuery, editMessageSchema, sendMessageSchema, cursorPaginationSchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware);

// PATCH /api/v1/messages/:messageId
router.patch(
  '/:messageId',
  validateBody(editMessageSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { text } = req.body;
      const message = await messageService.editMessage(req.user!.userId, req.params.messageId, text);
      res.json({
        success: true,
        data: { message },
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/messages/:messageId
router.delete('/:messageId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const message = await messageService.deleteMessage(req.user!.userId, req.params.messageId);
    res.json({
      success: true,
      data: { message },
    });
  } catch (err) {
    next(err);
  }
});

// Backward compatibility: GET /api/v1/messages/:conversationId
router.get(
  '/:conversationId',
  validateQuery(cursorPaginationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cursor, limit } = req.query as any;
      const result = await messageService.getMessages(req.user!.userId, req.params.conversationId, {
        cursor: cursor as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 30,
      });
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Backward compatibility: POST /api/v1/messages/:conversationId
router.post(
  '/:conversationId',
  validateBody(sendMessageSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { text, type, attachments, replyToId, clientMessageId } = req.body;
      const message = await messageService.sendMessage(req.user!.userId, req.params.conversationId, {
        text: text || '',
        type,
        attachments,
        replyToId,
        clientMessageId,
      });
      res.status(201).json({
        success: true,
        data: { message },
      });
    } catch (err) {
      next(err);
    }
  }
);

export const messageRoutes = router;
