import { Router, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validateBody, updateProfileSchema, changePasswordSchema } from '../validation/schemas';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.use(authMiddleware);

// GET /api/v1/users
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string | undefined;
    const currentUserId = req.user!.userId;

    const users = q
      ? await userService.searchUsers(q, currentUserId)
      : await userService.listUsers(currentUserId);

    res.json({
      success: true,
      data: { users },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/users/:userId
router.get('/:userId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUser(req.params.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.json({
      success: true,
      data: { user },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/users/me (and alias /profile)
const handleUpdateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { bio, avatar, soundEnabled, readReceiptsEnabled } = req.body;
    const updated = await userService.updateProfile(req.user!.userId, {
      bio,
      avatar,
      soundEnabled,
      readReceiptsEnabled,
    });
    res.json({
      success: true,
      data: { user: updated },
    });
  } catch (err) {
    next(err);
  }
};

router.patch('/me', validateBody(updateProfileSchema), handleUpdateProfile);
router.patch('/profile', validateBody(updateProfileSchema), handleUpdateProfile);

// POST /api/v1/users/change-password
router.post(
  '/change-password',
  validateBody(changePasswordSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { oldPassword, newPassword } = req.body;
      await userService.changePassword(req.user!.userId, oldPassword, newPassword);
      res.json({
        success: true,
        data: { message: 'Password changed successfully' },
      });
    } catch (err) {
      next(err);
    }
  }
);

export const userRoutes = router;
