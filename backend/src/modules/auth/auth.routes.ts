import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { getSchoolFeatures } from '../../lib/features';
import { clearFailures, isRateLimited, loginKeys, recordFailure } from '../../lib/ratelimit';
import {
  AUDIENCE,
  Audience,
  audienceForRole,
  authenticate,
  requireRoles,
  signToken,
  PLATFORM_ROLES,
} from '../../middleware/auth';
import { ApiError, asyncHandler, badRequest, forbidden, unauthorized } from '../../middleware/error';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function clientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
}

/**
 * Shared credential check used by both applications' login endpoints.
 * Wrong-domain accounts fail with the same generic message as bad
 * credentials — neither application reveals the other's existence.
 */
export async function performLogin(req: Request, expectedAudience: Audience) {
  const { email, password } = loginSchema.parse(req.body);
  const keys = loginKeys(clientIp(req), email);
  if (keys.some(isRateLimited)) {
    throw new ApiError(429, 'Too many attempts. Please try again in 15 minutes.');
  }

  const fail = (): never => {
    keys.forEach(recordFailure);
    throw unauthorized('Invalid email or password');
  };

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { school: { select: { id: true, name: true, status: true, logoUrl: true } } },
  });
  if (!user || !user.isActive) fail();
  const valid = await bcrypt.compare(password, user!.passwordHash);
  if (!valid) fail();
  if (audienceForRole(user!.role) !== expectedAudience) fail();

  if (user!.role === Role.STUDENT) {
    throw forbidden('The student portal is coming soon.');
  }
  if (user!.school && user!.school.status === 'SUSPENDED') {
    throw forbidden('This account is currently suspended. Contact support.');
  }

  keys.forEach(clearFailures);
  await prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
  audit({ schoolId: user!.schoolId, userId: user!.id, action: 'USER_LOGIN' });

  return user!;
}

/** POST /api/auth/login — School Management System sign-in (Application B). */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const user = await performLogin(req, AUDIENCE.SCHOOL);
    const features = user.schoolId ? await getSchoolFeatures(user.schoolId) : null;

    res.json({
      token: signToken(user, AUDIENCE.SCHOOL),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: user.schoolId,
        audience: AUDIENCE.SCHOOL,
      },
      school: user.school ? { id: user.school.id, name: user.school.name, logoUrl: user.school.logoUrl } : null,
      features,
    });
  })
);

/** GET /api/auth/me — session info for either application. */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const features = user.schoolId ? await getSchoolFeatures(user.schoolId) : null;
    const school = user.schoolId
      ? await prisma.school.findUnique({
          where: { id: user.schoolId },
          select: {
            id: true,
            name: true,
            logoUrl: true,
            status: true,
            settings: { select: { motto: true, primaryColor: true, secondaryColor: true, footerText: true, currency: true } },
          },
        })
      : null;
    res.json({ user, school, features });
  })
);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.nativeEnum(Role),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  schoolId: z.string().uuid().optional(),
});

/**
 * POST /api/auth/users — create a user account.
 * SCHOOL_ADMIN creates staff accounts for their own school;
 * SUPER_ADMIN can create any account including platform roles.
 */
router.post(
  '/users',
  authenticate,
  requireRoles(Role.SCHOOL_ADMIN),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const actor = req.user!;

    let schoolId: string | null;
    if (actor.role === Role.SUPER_ADMIN) {
      schoolId = PLATFORM_ROLES.includes(body.role) ? null : (body.schoolId ?? null);
      if (!schoolId && !PLATFORM_ROLES.includes(body.role)) {
        throw badRequest('schoolId is required for school-level roles');
      }
    } else {
      if (PLATFORM_ROLES.includes(body.role)) {
        throw forbidden('You cannot create this type of account');
      }
      schoolId = actor.schoolId;
    }

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
        firstName: body.firstName,
        lastName: body.lastName,
        schoolId,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, schoolId: true, isActive: true },
    });

    audit({ schoolId, userId: actor.id, action: 'USER_CREATED', entityType: 'User', entityId: user.id, newValues: { email: user.email, role: user.role } });
    res.status(201).json(user);
  })
);

/** GET /api/auth/users — list users of the actor's school (or any school for platform admins). */
router.get(
  '/users',
  authenticate,
  requireRoles(Role.SCHOOL_ADMIN, Role.SUPPORT_ADMIN),
  asyncHandler(async (req, res) => {
    const actor = req.user!;
    const schoolId = actor.schoolId ?? (req.query.schoolId as string | undefined);
    if (!schoolId) throw badRequest('schoolId is required');
    if (actor.schoolId && schoolId !== actor.schoolId) throw forbidden();

    const users = await prisma.user.findMany({
      where: { schoolId },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  })
);

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.nativeEnum(Role).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  password: z.string().min(8).optional(),
});

/**
 * PATCH /api/auth/users/:id — activate/deactivate, change role or reset password.
 * Password change, deactivation and role change bump tokenVersion, revoking
 * every outstanding session for that user instantly.
 */
router.patch(
  '/users/:id',
  authenticate,
  requireRoles(Role.SCHOOL_ADMIN),
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    const actor = req.user!;

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw badRequest('User not found');
    if (actor.role !== Role.SUPER_ADMIN && target.schoolId !== actor.schoolId) throw forbidden();
    if (actor.role !== Role.SUPER_ADMIN && body.role && PLATFORM_ROLES.includes(body.role)) {
      throw forbidden('You cannot assign this role');
    }

    const revokesSessions =
      body.password !== undefined || body.isActive === false || (body.role !== undefined && body.role !== target.role);

    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        isActive: body.isActive,
        role: body.role,
        firstName: body.firstName,
        lastName: body.lastName,
        passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
        tokenVersion: revokesSessions ? { increment: 1 } : undefined,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true },
    });

    audit({ schoolId: target.schoolId, userId: actor.id, action: 'USER_UPDATED', entityType: 'User', entityId: user.id, newValues: { isActive: body.isActive, role: body.role, sessionsRevoked: revokesSessions } });
    res.json(user);
  })
);

export default router;
