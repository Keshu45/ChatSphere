import { Router, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  validateBody,
  validateQuery,
  createConversationSchema,
  updateGroupSchema,
  addMembersSchema,
  sendMessageSchema,
  cursorPaginationSchema,
} from '../validation/schemas';
import { ValidationError, ForbiddenError } from '../utils/errors';

const router = Router();

router.use(authMiddleware);

// GET /api/v1/conversations
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const conversations = await conversationService.getUserConversations(req.user!.userId);
    res.json({
      success: true,
      data: { conversations },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/conversations (Universal handler for direct and group)
router.post(
  '/',
  validateBody(createConversationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { type, targetUserId, name, description, memberIds } = req.body;
      let conversation;

      if (type === 'direct') {
        if (!targetUserId) {
          throw new ValidationError('targetUserId is required for direct conversation');
        }
        conversation = await conversationService.getOrCreateDirectConversation(
          req.user!.userId,
          targetUserId
        );
      } else {
        if (!name) {
          throw new ValidationError('Channel name is required for group conversation');
        }
        conversation = await conversationService.createGroupConversation(
          req.user!.userId,
          name,
          description || '',
          memberIds || []
        );
      }

      res.status(201).json({
        success: true,
        data: { conversation },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Backward compatible aliases
router.post('/direct', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) throw new ValidationError('targetUserId is required');
    const conversation = await conversationService.getOrCreateDirectConversation(
      req.user!.userId,
      targetUserId
    );
    res.status(201).json({
      success: true,
      data: { conversation },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/group', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description = '', memberIds = [] } = req.body;
    if (!name) throw new ValidationError('Group name is required');
    const conversation = await conversationService.createGroupConversation(
      req.user!.userId,
      name,
      description,
      memberIds
    );
    res.status(201).json({
      success: true,
      data: { conversation },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/conversations/:conversationId
router.get('/:conversationId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const conversation = await conversationService.getConversationById(
      req.params.conversationId,
      req.user!.userId
    );
    res.json({
      success: true,
      data: { conversation },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/conversations/:conversationId
router.patch(
  '/:conversationId',
  validateBody(updateGroupSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, avatar } = req.body;
      const conversation = await conversationService.updateGroup(
        req.params.conversationId,
        req.user!.userId,
        { name, description, avatar }
      );
      res.json({
        success: true,
        data: { conversation },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/conversations/:conversationId/members
router.post(
  '/:conversationId/members',
  validateBody(addMembersSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { memberIds } = req.body;
      const conversation = await conversationService.addMembers(
        req.params.conversationId,
        req.user!.userId,
        memberIds
      );
      res.json({
        success: true,
        data: { conversation },
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/conversations/:conversationId/members/:userId
router.delete(
  '/:conversationId/members/:userId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversation = await conversationService.removeMember(
        req.params.conversationId,
        req.user!.userId,
        req.params.userId
      );
      res.json({
        success: true,
        data: { conversation },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/conversations/:conversationId/read
router.post('/:conversationId/read', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { upToMessageId } = req.body;
    const updatedIds = await messageService.markConversationRead(
      req.user!.userId,
      req.params.conversationId,
      upToMessageId
    );
    res.json({
      success: true,
      data: { updatedCount: updatedIds.length },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/conversations/:conversationId/messages
router.get(
  '/:conversationId/messages',
  validateQuery(cursorPaginationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cursor, limit } = req.query as any;
      const result = await messageService.getMessages(
        req.user!.userId,
        req.params.conversationId,
        {
          cursor: cursor as string | undefined,
          limit: limit ? parseInt(limit as string, 10) : 30,
        }
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

// POST /api/v1/conversations/:conversationId/messages
router.post(
  '/:conversationId/messages',
  validateBody(sendMessageSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { text, type, attachments, replyToId, clientMessageId } = req.body;
      const message = await messageService.sendMessage(
        req.user!.userId,
        req.params.conversationId,
        {
          text: text || '',
          type,
          attachments,
          replyToId,
          clientMessageId,
        }
      );
      res.status(201).json({
        success: true,
        data: { message },
      });
    } catch (err) {
      next(err);
    }
  }
);

export const conversationRoutes = router;
