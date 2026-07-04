import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { getSchoolFeatures } from '../../lib/features';
import { authenticate, requireRoles, signToken, PLATFORM_ROLES } from '../../middleware/auth';
import { asyncHandler, badRequest, forbidden, unauthorized } from '../../middleware/error';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/auth/login */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { school: { select: { id: true, name: true, status: true, logoUrl: true } } },
    });
    if (!user || !user.isActive) throw unauthorized('Invalid email or password');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw unauthorized('Invalid email or password');

    if (user.school && user.school.status === 'SUSPENDED') {
      throw forbidden('This school account is suspended. Contact Natural Intellects support.');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    audit({ schoolId: user.schoolId, userId: user.id, action: 'USER_LOGIN' });

    const features = user.schoolId ? await getSchoolFeatures(user.schoolId) : null;

    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        schoolId: user.schoolId,
        school: user.school ? { id: user.school.id, name: user.school.name, logoUrl: user.school.logoUrl } : null,
      },
      features,
    });
  })
);

/** GET /api/auth/me */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const features = user.schoolId ? await getSchoolFeatures(user.schoolId) : null;
    const school = user.schoolId
      ? await prisma.school.findUnique({
          where: { id: user.schoolId },
          select: { id: true, name: true, logoUrl: true, status: true },
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
        throw forbidden('You cannot create platform administrator accounts');
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

/** PATCH /api/auth/users/:id — activate/deactivate, change role or reset password. */
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
      throw forbidden('You cannot assign platform administrator roles');
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        isActive: body.isActive,
        role: body.role,
        firstName: body.firstName,
        lastName: body.lastName,
        passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true },
    });

    audit({ schoolId: target.schoolId, userId: actor.id, action: 'USER_UPDATED', entityType: 'User', entityId: user.id, newValues: { isActive: body.isActive, role: body.role } });
    res.json(user);
  })
);

export default router;
