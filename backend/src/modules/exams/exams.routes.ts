import { Router } from 'express';
import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest, conflict, notFound } from '../../middleware/error';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.ACADEMICS));

const READ = [Role.SCHOOL_ADMIN, Role.PROPRIETOR, Role.HEAD_TEACHER, Role.SECRETARY, Role.TEACHER];
const MANAGE = [Role.SCHOOL_ADMIN, Role.HEAD_TEACHER];

const DEFAULT_GRADING: Array<{ grade: string; min: number; max: number }> = [
  { grade: 'A', min: 80, max: 100 },
  { grade: 'B', min: 70, max: 79.99 },
  { grade: 'C', min: 60, max: 69.99 },
  { grade: 'D', min: 50, max: 59.99 },
  { grade: 'F', min: 0, max: 49.99 },
];

async function gradeFor(schoolId: string, percentage: number): Promise<string> {
  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId } });
  const scale = (settings?.gradingScale as Array<{ grade: string; min: number; max: number }> | null) ?? DEFAULT_GRADING;
  const match = scale.find((band) => percentage >= band.min && percentage <= band.max);
  return match?.grade ?? 'N/A';
}

// ---------------- Exams ----------------

const examSchema = z.object({
  name: z.string().min(1).max(100),
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  totalMarks: z.number().int().min(1).max(1000).default(100),
});

router.post(
  '/',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = examSchema.parse(req.body);
    const [term, cls] = await Promise.all([
      prisma.term.findFirst({ where: { id: body.termId, schoolId: req.schoolId! } }),
      prisma.class.findFirst({ where: { id: body.classId, schoolId: req.schoolId! } }),
    ]);
    if (!term) throw badRequest('Term not found in this school');
    if (!cls) throw badRequest('Class not found in this school');

    const exam = await prisma.exam.create({ data: { ...body, schoolId: req.schoolId! } });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'EXAM_CREATED', entityType: 'Exam', entityId: exam.id, newValues: body });
    res.status(201).json(exam);
  })
);

router.get(
  '/',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const { termId, classId } = req.query as Record<string, string | undefined>;
    const exams = await prisma.exam.findMany({
      where: { schoolId: req.schoolId!, ...(termId ? { termId } : {}), ...(classId ? { classId } : {}) },
      include: { term: true, class: true, _count: { select: { marks: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(exams);
  })
);

// ---------------- Marks entry ----------------

const marksSchema = z.object({
  examId: z.string().uuid(),
  subjectId: z.string().uuid(),
  marks: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        score: z.number().min(0),
        remarks: z.string().max(300).optional().nullable(),
      })
    )
    .min(1),
});

/** POST /api/exams/marks — bulk marks entry for a class subject. */
router.post(
  '/marks',
  requireRoles(Role.TEACHER, ...MANAGE),
  asyncHandler(async (req, res) => {
    const { examId, subjectId, marks } = marksSchema.parse(req.body);

    const exam = await prisma.exam.findFirst({ where: { id: examId, schoolId: req.schoolId! } });
    if (!exam) throw badRequest('Exam not found in this school');
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId: req.schoolId! } });
    if (!subject) throw badRequest('Subject not found in this school');

    const over = marks.filter((m) => m.score > exam.totalMarks);
    if (over.length > 0) throw badRequest(`Score cannot exceed the exam total of ${exam.totalMarks}`);

    const students = await prisma.student.findMany({
      where: { schoolId: req.schoolId!, classId: exam.classId, id: { in: marks.map((m) => m.studentId) } },
      select: { id: true },
    });
    if (students.length !== marks.length) throw badRequest('Some students do not belong to the exam class');

    // Block edits to marks already locked into a finalized report card.
    const finalized = await prisma.reportCard.count({
      where: { termId: exam.termId, isFinalized: true, studentId: { in: marks.map((m) => m.studentId) } },
    });
    if (finalized > 0) throw conflict('Some students already have a finalized report card for this term');

    let teacherId: string | null = null;
    if (req.user!.role === Role.TEACHER) {
      const profile = await prisma.teacher.findFirst({ where: { schoolId: req.schoolId!, userId: req.user!.id }, select: { id: true } });
      teacherId = profile?.id ?? null;
    }

    const saved = await prisma.$transaction(
      marks.map((m) => {
        const percentage = (m.score / exam.totalMarks) * 100;
        return prisma.studentMark.upsert({
          where: { studentId_subjectId_examId: { studentId: m.studentId, subjectId, examId } },
          create: {
            schoolId: req.schoolId!,
            studentId: m.studentId,
            subjectId,
            examId,
            teacherId,
            score: new Prisma.Decimal(m.score),
            remarks: m.remarks ?? null,
            grade: null, // set below (grade lookup is async)
          },
          update: { score: new Prisma.Decimal(m.score), remarks: m.remarks ?? null },
        });
      })
    );

    // Compute grades from the school's grading scale.
    for (const mark of saved) {
      const percentage = (Number(mark.score) / exam.totalMarks) * 100;
      const grade = await gradeFor(req.schoolId!, percentage);
      await prisma.studentMark.update({ where: { id: mark.id }, data: { grade } });
    }

    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'MARKS_ENTERED', entityType: 'Exam', entityId: examId, newValues: { subjectId, count: saved.length } });
    res.status(201).json({ saved: saved.length });
  })
);

/** GET /api/exams/:id/marks — marks for an exam (optionally one subject). */
router.get(
  '/:id/marks',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!exam) throw notFound('Exam not found');
    const subjectId = req.query.subjectId as string | undefined;
    const marks = await prisma.studentMark.findMany({
      where: { examId: exam.id, ...(subjectId ? { subjectId } : {}) },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
        subject: { select: { id: true, name: true } },
      },
      orderBy: [{ subject: { name: 'asc' } }, { student: { lastName: 'asc' } }],
    });
    res.json({ exam, marks });
  })
);

// ---------------- Report cards ----------------

const reportSchema = z.object({ studentId: z.string().uuid(), termId: z.string().uuid() });

/** POST /api/exams/reports — generate (or regenerate) a report card snapshot for a term. */
router.post(
  '/reports',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const { studentId, termId } = reportSchema.parse(req.body);
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId! }, include: { class: true, stream: true } });
    if (!student) throw badRequest('Student not found in this school');
    const term = await prisma.term.findFirst({ where: { id: termId, schoolId: req.schoolId! } });
    if (!term) throw badRequest('Term not found in this school');

    const existing = await prisma.reportCard.findUnique({ where: { studentId_termId: { studentId, termId } } });
    if (existing?.isFinalized) throw conflict('Report card is finalized and cannot be regenerated');

    const marks = await prisma.studentMark.findMany({
      where: { studentId, exam: { termId } },
      include: { subject: { select: { name: true } }, exam: { select: { name: true, totalMarks: true } } },
    });

    const subjects = marks.map((m) => ({
      subject: m.subject.name,
      exam: m.exam.name,
      score: Number(m.score),
      totalMarks: m.exam.totalMarks,
      percentage: Math.round((Number(m.score) / m.exam.totalMarks) * 10000) / 100,
      grade: m.grade,
      remarks: m.remarks,
    }));
    const average = subjects.length > 0 ? Math.round((subjects.reduce((sum, s) => sum + s.percentage, 0) / subjects.length) * 100) / 100 : 0;

    const data = {
      student: {
        name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
        admissionNumber: student.admissionNumber,
        class: student.class?.name ?? null,
        stream: student.stream?.name ?? null,
      },
      term: { name: term.name, year: term.year },
      subjects,
      average,
      overallGrade: await gradeFor(req.schoolId!, average),
    };

    const report = await prisma.reportCard.upsert({
      where: { studentId_termId: { studentId, termId } },
      create: { schoolId: req.schoolId!, studentId, termId, data, generatedBy: req.user!.id },
      update: { data, generatedAt: new Date(), generatedBy: req.user!.id },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'REPORT_GENERATED', entityType: 'ReportCard', entityId: report.id });
    res.status(201).json(report);
  })
);

/** POST /api/exams/reports/:id/finalize — finalized reports become immutable. */
router.post(
  '/reports/:id/finalize',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const report = await prisma.reportCard.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!report) throw notFound('Report card not found');
    if (report.isFinalized) throw conflict('Report card is already finalized');
    const updated = await prisma.reportCard.update({ where: { id: report.id }, data: { isFinalized: true } });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'REPORT_FINALIZED', entityType: 'ReportCard', entityId: report.id });
    res.json(updated);
  })
);

/** GET /api/exams/reports?termId=&studentId= — list report cards. */
router.get(
  '/reports/list',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const { termId, studentId } = req.query as Record<string, string | undefined>;
    const reports = await prisma.reportCard.findMany({
      where: { schoolId: req.schoolId!, ...(termId ? { termId } : {}), ...(studentId ? { studentId } : {}) },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
        term: { select: { name: true, year: true } },
      },
      orderBy: { generatedAt: 'desc' },
      take: 500,
    });
    res.json(reports);
  })
);

export default router;
