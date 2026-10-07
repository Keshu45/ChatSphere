import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authRateLimiter, passwordResetRateLimiter } from '../middleware/rateLimit.middleware';
import { validateBody, registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validation/schemas';
import { signToken } from '../utils/jwt';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, email, password } = req.body;
      const result = await authService.register(username, email, password);

      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { emailOrUsername, password } = req.body;
      const result = await authService.login(emailOrUsername, password);

      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
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

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.json({
      success: true,
      data: { user },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const freshToken = signToken({
    userId: req.user!.userId,
    username: req.user!.username,
    email: req.user!.email,
  });

  res.cookie('token', freshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    data: { token: freshToken },
  });
});

router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      const result = await authService.requestPasswordReset(email);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/reset-password',
  passwordResetRateLimiter,
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;
      await authService.resetPassword(token, newPassword);
      res.json({
        success: true,
        data: { message: 'Password has been reset successfully.' },
      });
    } catch (err) {
      next(err);
    }
  }
);

export const authRoutes = router;
