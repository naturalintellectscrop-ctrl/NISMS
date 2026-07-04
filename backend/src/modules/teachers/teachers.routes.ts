import { Router } from 'express';
import { z } from 'zod';
import { EmploymentType, Gender, Prisma, Role, TeacherStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest, notFound } from '../../middleware/error';
import { getPageParams, pageResult } from '../../utils/pagination';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.TEACHERS));

const READ = [Role.SCHOOL_ADMIN, Role.PROPRIETOR, Role.HEAD_TEACHER, Role.SECRETARY];
const WRITE = [Role.SCHOOL_ADMIN, Role.SECRETARY];

const createTeacherSchema = z.object({
  staffNumber: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1).max(100),
  gender: z.nativeEnum(Gender),
  dateOfBirth: z.coerce.date().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  phoneNumber: z.string().min(7).max(20),
  email: z.string().email().optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  employmentDate: z.coerce.date().optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
});

/** POST /api/teachers — register a teacher. */
router.post(
  '/',
  requireRoles(...WRITE),
  asyncHandler(async (req, res) => {
    const body = createTeacherSchema.parse(req.body);
    const teacher = await prisma.teacher.create({ data: { ...body, schoolId: req.schoolId! } });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'TEACHER_CREATED', entityType: 'Teacher', entityId: teacher.id, newValues: { staffNumber: teacher.staffNumber } });
    res.status(201).json(teacher);
  })
);

/** GET /api/teachers — list & search. */
router.get(
  '/',
  requireRoles(...READ, Role.TEACHER, Role.BURSAR),
  asyncHandler(async (req, res) => {
    const { search, status } = req.query as Record<string, string | undefined>;
    const params = getPageParams(req);
    const where: Prisma.TeacherWhereInput = {
      schoolId: req.schoolId!,
      ...(status ? { status: status as TeacherStatus } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { staffNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.teacher.findMany({
        where,
        include: {
          subjects: { include: { subject: { select: { id: true, name: true } } } },
          classes: { include: { class: { select: { id: true, name: true } }, subject: { select: { id: true, name: true } } } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: params.skip,
        take: params.take,
      }),
      prisma.teacher.count({ where }),
    ]);
    res.json(pageResult(items, total, params));
  })
);

/** GET /api/teachers/:id — profile with subjects and class assignments. */
router.get(
  '/:id',
  requireRoles(...READ, Role.TEACHER),
  asyncHandler(async (req, res) => {
    const teacher = await prisma.teacher.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId! },
      include: {
        subjects: { include: { subject: true } },
        classes: { include: { class: true, subject: true } },
      },
    });
    if (!teacher) throw notFound('Teacher not found');
    res.json(teacher);
  })
);

/** PATCH /api/teachers/:id — edit teacher. */
router.patch(
  '/:id',
  requireRoles(...WRITE),
  asyncHandler(async (req, res) => {
    const body = createTeacherSchema.partial().extend({ status: z.nativeEnum(TeacherStatus).optional() }).parse(req.body);
    const existing = await prisma.teacher.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Teacher not found');
    const data = { ...body, archivedAt: body.status === TeacherStatus.ARCHIVED ? new Date() : undefined };
    const teacher = await prisma.teacher.update({ where: { id: existing.id }, data });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'TEACHER_UPDATED', entityType: 'Teacher', entityId: teacher.id, newValues: body });
    res.json(teacher);
  })
);

const assignSubjectsSchema = z.object({ subjectIds: z.array(z.string().uuid()) });

/** PUT /api/teachers/:id/subjects — replace subject assignments. */
router.put(
  '/:id/subjects',
  requireRoles(Role.SCHOOL_ADMIN, Role.HEAD_TEACHER),
  asyncHandler(async (req, res) => {
    const { subjectIds } = assignSubjectsSchema.parse(req.body);
    const teacher = await prisma.teacher.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!teacher) throw notFound('Teacher not found');

    const count = await prisma.subject.count({ where: { id: { in: subjectIds }, schoolId: req.schoolId! } });
    if (count !== subjectIds.length) throw badRequest('One or more subjects do not belong to this school');

    await prisma.$transaction([
      prisma.teacherSubject.deleteMany({ where: { teacherId: teacher.id } }),
      prisma.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId: teacher.id, subjectId })) }),
    ]);
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'TEACHER_SUBJECTS_ASSIGNED', entityType: 'Teacher', entityId: teacher.id, newValues: { subjectIds } });
    res.json(await prisma.teacherSubject.findMany({ where: { teacherId: teacher.id }, include: { subject: true } }));
  })
);

const assignClassSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  isClassTeacher: z.boolean().default(false),
});

/** POST /api/teachers/:id/classes — assign teacher to a class (optionally per subject). */
router.post(
  '/:id/classes',
  requireRoles(Role.SCHOOL_ADMIN, Role.HEAD_TEACHER),
  asyncHandler(async (req, res) => {
    const { classId, subjectId, isClassTeacher } = assignClassSchema.parse(req.body);
    const teacher = await prisma.teacher.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!teacher) throw notFound('Teacher not found');
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId: req.schoolId! } });
    if (!cls) throw badRequest('Class not found in this school');

    // Business rule: one class has exactly one class teacher.
    if (isClassTeacher) {
      await prisma.teacherClass.updateMany({ where: { classId, isClassTeacher: true }, data: { isClassTeacher: false } });
    }

    const assignment = await prisma.teacherClass.create({
      data: { teacherId: teacher.id, classId, subjectId: subjectId ?? null, isClassTeacher },
      include: { class: true, subject: true },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'TEACHER_CLASS_ASSIGNED', entityType: 'Teacher', entityId: teacher.id, newValues: { classId, subjectId, isClassTeacher } });
    res.status(201).json(assignment);
  })
);

/** DELETE /api/teachers/:id/classes/:assignmentId — remove class assignment. */
router.delete(
  '/:id/classes/:assignmentId',
  requireRoles(Role.SCHOOL_ADMIN, Role.HEAD_TEACHER),
  asyncHandler(async (req, res) => {
    const teacher = await prisma.teacher.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!teacher) throw notFound('Teacher not found');
    const assignment = await prisma.teacherClass.findFirst({ where: { id: req.params.assignmentId, teacherId: teacher.id } });
    if (!assignment) throw notFound('Assignment not found');
    await prisma.teacherClass.delete({ where: { id: assignment.id } });
    res.status(204).end();
  })
);

export default router;
