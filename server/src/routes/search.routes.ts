import { Router, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { messageService } from '../services/message.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { ValidationError } from '../utils/errors';

const router = Router();

router.use(authMiddleware);

// GET /api/v1/search/users
router.get('/users', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string) || '';
    const users = await userService.searchUsers(q, req.user!.userId);
    res.json({
      success: true,
      data: { users },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/search/messages
router.get('/messages', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const conversationId = req.query.conversationId as string;
    const q = (req.query.q as string) || '';

    if (!conversationId) {
      throw new ValidationError('conversationId query parameter is required');
    }

    const messages = await messageService.searchMessages(req.user!.userId, conversationId, q);
    res.json({
      success: true,
      data: { messages },
    });
  } catch (err) {
    next(err);
  }
});

export const searchRoutes = router;
