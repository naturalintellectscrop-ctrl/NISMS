import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { getSchoolFeatures } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { asyncHandler, notFound } from '../../middleware/error';

const router = Router();
router.use(authenticate, tenantContext);

/** GET /api/school — the tenant school's profile, settings and features. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const school = await prisma.school.findUnique({
      where: { id: req.schoolId! },
      include: { settings: true, subscription: { select: { planType: true, status: true, renewalDate: true } } },
    });
    if (!school) throw notFound('School not found');
    const features = await getSchoolFeatures(school.id);
    res.json({ ...school, features });
  })
);

const updateSchoolSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  logoUrl: z.string().url().optional().nullable(),
  websiteDomain: z.string().max(200).optional().nullable(),
});

/** PATCH /api/school — update the school profile. */
router.patch(
  '/',
  requireRoles(Role.SCHOOL_ADMIN, Role.PROPRIETOR),
  asyncHandler(async (req, res) => {
    const body = updateSchoolSchema.parse(req.body);
    const school = await prisma.school.update({ where: { id: req.schoolId! }, data: body });
    audit({ schoolId: school.id, userId: req.user!.id, action: 'SCHOOL_UPDATED', entityType: 'School', entityId: school.id, newValues: body });
    res.json(school);
  })
);

const settingsSchema = z.object({
  motto: z.string().max(300).optional().nullable(),
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
  currency: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
  gradingScale: z
    .array(z.object({ grade: z.string().max(5), min: z.number().min(0), max: z.number().max(100) }))
    .optional(),
});

/** PUT /api/school/settings — upsert school settings. */
router.put(
  '/settings',
  requireRoles(Role.SCHOOL_ADMIN),
  asyncHandler(async (req, res) => {
    const body = settingsSchema.parse(req.body);
    const settings = await prisma.schoolSettings.upsert({
      where: { schoolId: req.schoolId! },
      create: { schoolId: req.schoolId!, ...body },
      update: body,
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'SCHOOL_SETTINGS_UPDATED', entityType: 'SchoolSettings', entityId: settings.id, newValues: body });
    res.json(settings);
  })
);

/** GET /api/school/features — feature map for UI rendering (frontend reflects, backend enforces). */
router.get(
  '/features',
  asyncHandler(async (req, res) => {
    res.json(await getSchoolFeatures(req.schoolId!));
  })
);

export default router;
