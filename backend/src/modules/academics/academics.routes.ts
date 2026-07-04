import { Router } from 'express';
import { z } from 'zod';
import { Role, SubjectCategory } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest, notFound } from '../../middleware/error';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.ACADEMICS));

const STAFF = [Role.SCHOOL_ADMIN, Role.PROPRIETOR, Role.HEAD_TEACHER, Role.SECRETARY, Role.BURSAR, Role.TEACHER];
const MANAGE = [Role.SCHOOL_ADMIN, Role.HEAD_TEACHER];

// ---------------- Classes ----------------

const classSchema = z.object({ name: z.string().min(1).max(50), level: z.number().int().min(0).max(20).default(0) });

router.post(
  '/classes',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = classSchema.parse(req.body);
    const cls = await prisma.class.create({ data: { ...body, schoolId: req.schoolId! } });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'CLASS_CREATED', entityType: 'Class', entityId: cls.id, newValues: body });
    res.status(201).json(cls);
  })
);

router.get(
  '/classes',
  requireRoles(...STAFF),
  asyncHandler(async (req, res) => {
    const classes = await prisma.class.findMany({
      where: { schoolId: req.schoolId! },
      include: {
        streams: true,
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
        teachers: { where: { isClassTeacher: true }, include: { teacher: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { level: 'asc' },
    });
    res.json(classes);
  })
);

router.patch(
  '/classes/:id',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = classSchema.partial().parse(req.body);
    const existing = await prisma.class.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Class not found');
    res.json(await prisma.class.update({ where: { id: existing.id }, data: body }));
  })
);

// ---------------- Streams ----------------

const streamSchema = z.object({ classId: z.string().uuid(), name: z.string().min(1).max(50) });

router.post(
  '/streams',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = streamSchema.parse(req.body);
    const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: req.schoolId! } });
    if (!cls) throw badRequest('Class not found in this school');
    const stream = await prisma.stream.create({ data: { ...body, schoolId: req.schoolId! } });
    res.status(201).json(stream);
  })
);

router.get(
  '/streams',
  requireRoles(...STAFF),
  asyncHandler(async (req, res) => {
    const classId = req.query.classId as string | undefined;
    const streams = await prisma.stream.findMany({
      where: { schoolId: req.schoolId!, ...(classId ? { classId } : {}) },
      include: { class: { select: { id: true, name: true } }, _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(streams);
  })
);

// ---------------- Subjects ----------------

const subjectSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional().nullable(),
  category: z.nativeEnum(SubjectCategory).default(SubjectCategory.OTHER),
});

router.post(
  '/subjects',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = subjectSchema.parse(req.body);
    const subject = await prisma.subject.create({ data: { ...body, schoolId: req.schoolId! } });
    res.status(201).json(subject);
  })
);

router.get(
  '/subjects',
  requireRoles(...STAFF),
  asyncHandler(async (req, res) => {
    const subjects = await prisma.subject.findMany({
      where: { schoolId: req.schoolId! },
      include: { teachers: { include: { teacher: { select: { id: true, firstName: true, lastName: true } } } } },
      orderBy: { name: 'asc' },
    });
    res.json(subjects);
  })
);

router.patch(
  '/subjects/:id',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = subjectSchema.partial().parse(req.body);
    const existing = await prisma.subject.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Subject not found');
    res.json(await prisma.subject.update({ where: { id: existing.id }, data: body }));
  })
);

// ---------------- Terms ----------------

const termSchema = z
  .object({
    name: z.string().min(1).max(30), // TERM_I, TERM_II, TERM_III
    year: z.number().int().min(2000).max(2100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isActive: z.boolean().default(false),
  })
  .refine((t) => t.endDate > t.startDate, { message: 'endDate must be after startDate' });

router.post(
  '/terms',
  requireRoles(Role.SCHOOL_ADMIN),
  asyncHandler(async (req, res) => {
    const body = termSchema.parse(req.body);
    const term = await prisma.$transaction(async (tx) => {
      if (body.isActive) {
        await tx.term.updateMany({ where: { schoolId: req.schoolId! }, data: { isActive: false } });
      }
      return tx.term.create({ data: { ...body, schoolId: req.schoolId! } });
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'TERM_CREATED', entityType: 'Term', entityId: term.id, newValues: { name: term.name, year: term.year } });
    res.status(201).json(term);
  })
);

router.get(
  '/terms',
  requireRoles(...STAFF),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.term.findMany({
        where: { schoolId: req.schoolId! },
        orderBy: [{ year: 'desc' }, { startDate: 'desc' }],
      })
    );
  })
);

/** POST /api/academics/terms/:id/activate — mark a term as the current one. */
router.post(
  '/terms/:id/activate',
  requireRoles(Role.SCHOOL_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.term.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Term not found');
    const [, term] = await prisma.$transaction([
      prisma.term.updateMany({ where: { schoolId: req.schoolId! }, data: { isActive: false } }),
      prisma.term.update({ where: { id: existing.id }, data: { isActive: true } }),
    ]);
    res.json(term);
  })
);

export default router;
