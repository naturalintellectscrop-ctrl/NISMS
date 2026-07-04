import { Router } from 'express';
import { z } from 'zod';
import { AnnouncementAudience, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest, notFound } from '../../middleware/error';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.ANNOUNCEMENTS));

const MANAGE = [Role.SCHOOL_ADMIN, Role.HEAD_TEACHER, Role.SECRETARY];

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  audience: z.nativeEnum(AnnouncementAudience).default(AnnouncementAudience.ALL),
  classId: z.string().uuid().optional().nullable(),
  publish: z.boolean().default(false),
});

/** POST /api/announcements — create (optionally publish immediately). */
router.post(
  '/',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = announcementSchema.parse(req.body);
    if (body.classId) {
      const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: req.schoolId! } });
      if (!cls) throw badRequest('Class not found in this school');
    }
    const announcement = await prisma.announcement.create({
      data: {
        schoolId: req.schoolId!,
        title: body.title,
        body: body.body,
        audience: body.audience,
        classId: body.classId ?? null,
        publishedAt: body.publish ? new Date() : null,
        createdBy: req.user!.id,
      },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'ANNOUNCEMENT_CREATED', entityType: 'Announcement', entityId: announcement.id, newValues: { title: body.title, audience: body.audience } });
    res.status(201).json(announcement);
  })
);

/** GET /api/announcements — published announcements relevant to the caller's role. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const audienceFor: Partial<Record<Role, AnnouncementAudience[]>> = {
      [Role.TEACHER]: [AnnouncementAudience.ALL, AnnouncementAudience.TEACHERS, AnnouncementAudience.STAFF],
      [Role.STUDENT]: [AnnouncementAudience.ALL, AnnouncementAudience.STUDENTS],
      [Role.BURSAR]: [AnnouncementAudience.ALL, AnnouncementAudience.STAFF],
      [Role.SECRETARY]: [AnnouncementAudience.ALL, AnnouncementAudience.STAFF],
    };
    const isManager = ([Role.SCHOOL_ADMIN, Role.HEAD_TEACHER, Role.PROPRIETOR, Role.SUPER_ADMIN, Role.SUPPORT_ADMIN] as Role[]).includes(role);
    const includeDrafts = isManager && req.query.includeDrafts === 'true';

    const announcements = await prisma.announcement.findMany({
      where: {
        schoolId: req.schoolId!,
        ...(includeDrafts ? {} : { publishedAt: { not: null } }),
        ...(isManager ? {} : { audience: { in: audienceFor[role] ?? [AnnouncementAudience.ALL] } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(announcements);
  })
);

/** POST /api/announcements/:id/publish */
router.post(
  '/:id/publish',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const existing = await prisma.announcement.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Announcement not found');
    const announcement = await prisma.announcement.update({ where: { id: existing.id }, data: { publishedAt: new Date() } });
    res.json(announcement);
  })
);

/** PATCH /api/announcements/:id */
router.patch(
  '/:id',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = announcementSchema.partial().parse(req.body);
    const existing = await prisma.announcement.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Announcement not found');
    const { publish, ...rest } = body;
    const announcement = await prisma.announcement.update({
      where: { id: existing.id },
      data: { ...rest, ...(publish !== undefined ? { publishedAt: publish ? new Date() : null } : {}) },
    });
    res.json(announcement);
  })
);

export default router;
