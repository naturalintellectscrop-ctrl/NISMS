import { Router } from 'express';
import { z } from 'zod';
import { AttendanceStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest } from '../../middleware/error';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.ATTENDANCE));

const READ = [Role.SCHOOL_ADMIN, Role.PROPRIETOR, Role.HEAD_TEACHER, Role.SECRETARY, Role.TEACHER];

/** Normalizes a date to midnight UTC so the per-day uniqueness rule holds. */
function toDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const markSchema = z.object({
  classId: z.string().uuid(),
  date: z.coerce.date().refine((d) => d <= new Date(), 'Attendance cannot be marked for a future date'),
  teacherId: z.string().uuid().optional(),
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.nativeEnum(AttendanceStatus),
        remarks: z.string().max(300).optional().nullable(),
      })
    )
    .min(1),
});

/**
 * POST /api/attendance — submit attendance for a class on a date.
 * One record per student per day (upsert keeps the rule while allowing same-day correction).
 */
router.post(
  '/',
  requireRoles(Role.TEACHER, Role.SCHOOL_ADMIN, Role.HEAD_TEACHER),
  asyncHandler(async (req, res) => {
    const { classId, date, records, teacherId } = markSchema.parse(req.body);
    const day = toDay(date);

    const students = await prisma.student.findMany({
      where: { schoolId: req.schoolId!, classId, status: 'ACTIVE' },
      select: { id: true },
    });
    const validIds = new Set(students.map((s) => s.id));
    const invalid = records.filter((r) => !validIds.has(r.studentId));
    if (invalid.length > 0) throw badRequest('Some students do not belong to this class or school');

    // Resolve the acting teacher profile when the submitter is a teacher.
    let actingTeacherId = teacherId ?? null;
    if (!actingTeacherId && req.user!.role === Role.TEACHER) {
      const profile = await prisma.teacher.findFirst({ where: { schoolId: req.schoolId!, userId: req.user!.id }, select: { id: true } });
      actingTeacherId = profile?.id ?? null;
    }

    const results = await prisma.$transaction(
      records.map((r) =>
        prisma.attendance.upsert({
          where: { studentId_date: { studentId: r.studentId, date: day } },
          create: {
            schoolId: req.schoolId!,
            studentId: r.studentId,
            teacherId: actingTeacherId,
            date: day,
            status: r.status,
            remarks: r.remarks ?? null,
          },
          update: { status: r.status, remarks: r.remarks ?? null },
        })
      )
    );

    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'ATTENDANCE_SUBMITTED', entityType: 'Attendance', newValues: { classId, date: day.toISOString(), count: results.length } });
    res.status(201).json({ saved: results.length, date: day });
  })
);

/** GET /api/attendance?classId=&date= — class register for a day. */
router.get(
  '/',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const { classId, date, studentId, from, to } = req.query as Record<string, string | undefined>;
    if (!classId && !studentId) throw badRequest('classId or studentId is required');

    const where = {
      schoolId: req.schoolId!,
      ...(studentId ? { studentId } : {}),
      ...(classId ? { student: { classId } } : {}),
      ...(date ? { date: toDay(new Date(date)) } : {}),
      ...(from || to
        ? { date: { ...(from ? { gte: toDay(new Date(from)) } : {}), ...(to ? { lte: toDay(new Date(to)) } : {}) } }
        : {}),
    };

    const records = await prisma.attendance.findMany({
      where,
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
      orderBy: [{ date: 'desc' }, { student: { lastName: 'asc' } }],
      take: 1000,
    });
    res.json(records);
  })
);

/** GET /api/attendance/summary?classId=&from=&to= — daily/weekly/monthly report. */
router.get(
  '/summary',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const { classId, from, to } = req.query as Record<string, string | undefined>;
    const where = {
      schoolId: req.schoolId!,
      ...(classId ? { student: { classId } } : {}),
      ...(from || to
        ? { date: { ...(from ? { gte: toDay(new Date(from)) } : {}), ...(to ? { lte: toDay(new Date(to)) } : {}) } }
        : {}),
    };
    const grouped = await prisma.attendance.groupBy({ by: ['status'], where, _count: { status: true } });
    const byDate = await prisma.attendance.groupBy({ by: ['date', 'status'], where, _count: { status: true }, orderBy: { date: 'asc' } });
    res.json({
      totals: Object.fromEntries(grouped.map((g) => [g.status, g._count.status])),
      byDate: byDate.map((g) => ({ date: g.date, status: g.status, count: g._count.status })),
    });
  })
);

export default router;
