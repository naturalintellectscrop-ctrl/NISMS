import { Router } from 'express';
import { z } from 'zod';
import { Gender, Prisma, Role, StudentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest, notFound } from '../../middleware/error';
import { getPageParams, pageResult } from '../../utils/pagination';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.STUDENTS));

const STAFF_READ = [Role.SCHOOL_ADMIN, Role.PROPRIETOR, Role.HEAD_TEACHER, Role.SECRETARY, Role.BURSAR, Role.TEACHER];
const STUDENT_WRITE = [Role.SCHOOL_ADMIN, Role.SECRETARY];

const dateString = z.coerce.date();

const createStudentSchema = z.object({
  admissionNumber: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1).max(100),
  gender: z.nativeEnum(Gender),
  dateOfBirth: dateString.refine((d) => d < new Date(), 'Date of birth cannot be in the future'),
  nationality: z.string().max(100).optional(),
  religion: z.string().max(100).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  admissionDate: dateString.optional(),
  classId: z.string().uuid().optional().nullable(),
  streamId: z.string().uuid().optional().nullable(),
});

/** Ensures class/stream belong to the tenant school and match each other. */
async function validateClassStream(schoolId: string, classId?: string | null, streamId?: string | null) {
  if (classId) {
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw badRequest('Class not found in this school');
  }
  if (streamId) {
    const stream = await prisma.stream.findFirst({ where: { id: streamId, schoolId } });
    if (!stream) throw badRequest('Stream not found in this school');
    if (classId && stream.classId !== classId) throw badRequest('Stream does not belong to the selected class');
  }
}

/** POST /api/students — register a student. */
router.post(
  '/',
  requireRoles(...STUDENT_WRITE),
  asyncHandler(async (req, res) => {
    const body = createStudentSchema.parse(req.body);
    await validateClassStream(req.schoolId!, body.classId, body.streamId);

    const student = await prisma.student.create({
      data: { ...body, schoolId: req.schoolId! },
      include: { class: true, stream: true },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'STUDENT_CREATED', entityType: 'Student', entityId: student.id, newValues: { admissionNumber: student.admissionNumber } });
    res.status(201).json(student);
  })
);

/** GET /api/students — search & list (name, admission number, class, stream, status). */
router.get(
  '/',
  requireRoles(...STAFF_READ),
  asyncHandler(async (req, res) => {
    const { search, classId, streamId, status } = req.query as Record<string, string | undefined>;
    const params = getPageParams(req);

    const where: Prisma.StudentWhereInput = {
      schoolId: req.schoolId!,
      ...(classId ? { classId } : {}),
      ...(streamId ? { streamId } : {}),
      ...(status ? { status: status as StudentStatus } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { middleName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { admissionNumber: { contains: search, mode: 'insensitive' } },
              { guardians: { some: { guardian: { fullName: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: { class: { select: { id: true, name: true } }, stream: { select: { id: true, name: true } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: params.skip,
        take: params.take,
      }),
      prisma.student.count({ where }),
    ]);
    res.json(pageResult(items, total, params));
  })
);

/** GET /api/students/:id — full profile with guardians, attendance, fees, academics. */
router.get(
  '/:id',
  requireRoles(...STAFF_READ),
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId! },
      include: {
        class: true,
        stream: true,
        guardians: { include: { guardian: true } },
      },
    });
    if (!student) throw notFound('Student not found');

    const [attendanceSummary, payments, marks] = await Promise.all([
      prisma.attendance.groupBy({
        by: ['status'],
        where: { studentId: student.id },
        _count: { status: true },
      }),
      prisma.payment.findMany({
        where: { studentId: student.id },
        orderBy: { paymentDate: 'desc' },
        take: 10,
      }),
      prisma.studentMark.findMany({
        where: { studentId: student.id },
        include: { subject: { select: { name: true } }, exam: { select: { name: true, totalMarks: true, termId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const totalPaid = await prisma.payment.aggregate({ where: { studentId: student.id }, _sum: { amount: true } });

    res.json({
      ...student,
      attendanceSummary: Object.fromEntries(attendanceSummary.map((row) => [row.status, row._count.status])),
      recentPayments: payments,
      totalPaid: totalPaid._sum.amount ?? 0,
      recentMarks: marks,
    });
  })
);

const updateStudentSchema = createStudentSchema.partial();

/** PATCH /api/students/:id — edit a student. */
router.patch(
  '/:id',
  requireRoles(...STUDENT_WRITE),
  asyncHandler(async (req, res) => {
    const body = updateStudentSchema.parse(req.body);
    const existing = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Student not found');
    await validateClassStream(req.schoolId!, body.classId, body.streamId);

    const student = await prisma.student.update({ where: { id: existing.id }, data: body, include: { class: true, stream: true } });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'STUDENT_UPDATED', entityType: 'Student', entityId: student.id, newValues: body });
    res.json(student);
  })
);

const archiveSchema = z.object({
  reason: z.string().min(1).max(300),
  status: z.enum([StudentStatus.ARCHIVED, StudentStatus.TRANSFERRED, StudentStatus.GRADUATED]).default(StudentStatus.ARCHIVED),
});

/** POST /api/students/:id/archive — archive/transfer/graduate (never delete). */
router.post(
  '/:id/archive',
  requireRoles(...STUDENT_WRITE),
  asyncHandler(async (req, res) => {
    const { reason, status } = archiveSchema.parse(req.body);
    const existing = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Student not found');

    const student = await prisma.student.update({
      where: { id: existing.id },
      data: { status, archivedAt: new Date(), archiveReason: reason },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: `STUDENT_${status}`, entityType: 'Student', entityId: student.id, oldValues: { status: existing.status }, newValues: { status, reason } });
    res.json(student);
  })
);

const promoteSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1),
  toClassId: z.string().uuid(),
  toStreamId: z.string().uuid().optional().nullable(),
});

/** POST /api/students/promote — individual or bulk promotion. */
router.post(
  '/promote',
  requireRoles(Role.SCHOOL_ADMIN, Role.HEAD_TEACHER),
  asyncHandler(async (req, res) => {
    const { studentIds, toClassId, toStreamId } = promoteSchema.parse(req.body);
    await validateClassStream(req.schoolId!, toClassId, toStreamId);

    const result = await prisma.student.updateMany({
      where: { id: { in: studentIds }, schoolId: req.schoolId!, status: StudentStatus.ACTIVE },
      data: { classId: toClassId, streamId: toStreamId ?? null },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'STUDENTS_PROMOTED', entityType: 'Student', newValues: { count: result.count, toClassId, toStreamId } });
    res.json({ promoted: result.count });
  })
);

// ---------------- Guardians ----------------

const guardianSchema = z.object({
  fullName: z.string().min(1).max(100),
  phoneNumber: z.string().min(7).max(20),
  alternativePhone: z.string().max(20).optional().nullable(),
  relationship: z.enum(['Father', 'Mother', 'Sponsor', 'Relative', 'Other']),
  address: z.string().max(300).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
});

/** POST /api/students/:id/guardians — create & link a guardian. */
router.post(
  '/:id/guardians',
  requireRoles(...STUDENT_WRITE),
  asyncHandler(async (req, res) => {
    const body = guardianSchema.extend({ isPrimaryContact: z.boolean().default(false), guardianId: z.string().uuid().optional() }).parse(req.body);
    const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!student) throw notFound('Student not found');

    const { isPrimaryContact, guardianId, ...guardianData } = body;
    const guardian = guardianId
      ? await prisma.guardian.findFirst({ where: { id: guardianId, schoolId: req.schoolId! } })
      : await prisma.guardian.create({ data: { ...guardianData, schoolId: req.schoolId! } });
    if (!guardian) throw notFound('Guardian not found');

    const link = await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
      create: { studentId: student.id, guardianId: guardian.id, isPrimaryContact },
      update: { isPrimaryContact },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'GUARDIAN_LINKED', entityType: 'Guardian', entityId: guardian.id, newValues: { studentId: student.id } });
    res.status(201).json({ guardian, link });
  })
);

/** DELETE /api/students/:id/guardians/:guardianId — unlink (guardian record retained). */
router.delete(
  '/:id/guardians/:guardianId',
  requireRoles(...STUDENT_WRITE),
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!student) throw notFound('Student not found');
    await prisma.studentGuardian.delete({
      where: { studentId_guardianId: { studentId: student.id, guardianId: req.params.guardianId } },
    });
    res.status(204).end();
  })
);

export default router;
