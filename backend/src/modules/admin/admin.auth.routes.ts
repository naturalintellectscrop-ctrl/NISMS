import { Router } from 'express';
import { AUDIENCE, signToken } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/error';
import { performLogin } from '../auth/auth.routes';

/**
 * Natural Intellects Platform sign-in (Application A).
 * Separate entry point from the school portal; only platform staff
 * accounts authenticate here.
 */
const router = Router();

/** POST /api/admin/auth/login */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const user = await performLogin(req, AUDIENCE.PLATFORM);
    res.json({
      token: signToken(user, AUDIENCE.PLATFORM),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: null,
        audience: AUDIENCE.PLATFORM,
      },
    });
  })
);

export default router;
