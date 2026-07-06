import { Router } from 'express';
import { z } from 'zod';
import { PaymentMethod, Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest, notFound } from '../../middleware/error';
import { getPageParams, pageResult } from '../../utils/pagination';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.FEES));

const READ = [Role.SCHOOL_ADMIN, Role.PROPRIETOR, Role.BURSAR, Role.SECRETARY];
const WRITE = [Role.SCHOOL_ADMIN, Role.BURSAR];

// ---------------- Fee structures ----------------

const feeStructureSchema = z.object({
  classId: z.string().uuid(),
  termId: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().max(300).optional().nullable(),
});

router.post(
  '/fee-structures',
  requireRoles(...WRITE),
  asyncHandler(async (req, res) => {
    const body = feeStructureSchema.parse(req.body);
    const [cls, term] = await Promise.all([
      prisma.class.findFirst({ where: { id: body.classId, schoolId: req.schoolId! } }),
      prisma.term.findFirst({ where: { id: body.termId, schoolId: req.schoolId! } }),
    ]);
    if (!cls) throw badRequest('Class not found in this school');
    if (!term) throw badRequest('Term not found in this school');

    const fee = await prisma.feeStructure.upsert({
      where: { schoolId_classId_termId: { schoolId: req.schoolId!, classId: body.classId, termId: body.termId } },
      create: { ...body, amount: new Prisma.Decimal(body.amount), schoolId: req.schoolId! },
      update: { amount: new Prisma.Decimal(body.amount), description: body.description },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'FEE_STRUCTURE_SET', entityType: 'FeeStructure', entityId: fee.id, newValues: body });
    res.status(201).json(fee);
  })
);

router.get(
  '/fee-structures',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const { termId, classId } = req.query as Record<string, string | undefined>;
    const fees = await prisma.feeStructure.findMany({
      where: { schoolId: req.schoolId!, ...(termId ? { termId } : {}), ...(classId ? { classId } : {}) },
      include: { class: { select: { id: true, name: true } }, term: { select: { id: true, name: true, year: true } } },
      orderBy: [{ term: { year: 'desc' } }, { class: { level: 'asc' } }],
    });
    res.json(fees);
  })
);

// ---------------- Payments (immutable) ----------------

/**
 * Generates the next sequential receipt number for the school, e.g. RCT-000042.
 * Atomic: the counter row update takes a row-level lock, so concurrent
 * payments serialize instead of colliding.
 */
async function nextReceiptNumber(tx: Prisma.TransactionClient, schoolId: string): Promise<string> {
  await tx.receiptCounter.upsert({ where: { schoolId }, create: { schoolId, lastNumber: 0 }, update: {} });
  const counter = await tx.receiptCounter.update({
    where: { schoolId },
    data: { lastNumber: { increment: 1 } },
  });
  return `RCT-${String(counter.lastNumber).padStart(6, '0')}`;
}

const paymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  referenceNumber: z.string().max(100).optional().nullable(),
  paymentDate: z.coerce.date().optional(),
});

/** POST /api/finance/payments — record a payment (cannot be edited or deleted afterwards). */
router.post(
  '/payments',
  requireRoles(...WRITE),
  asyncHandler(async (req, res) => {
    const body = paymentSchema.parse(req.body);
    const student = await prisma.student.findFirst({ where: { id: body.studentId, schoolId: req.schoolId! } });
    if (!student) throw badRequest('Student not found in this school');

    const payment = await prisma.$transaction(async (tx) => {
      const receiptNumber = await nextReceiptNumber(tx, req.schoolId!);
      return tx.payment.create({
        data: {
          schoolId: req.schoolId!,
          studentId: body.studentId,
          amount: new Prisma.Decimal(body.amount),
          paymentMethod: body.paymentMethod,
          referenceNumber: body.referenceNumber ?? null,
          receiptNumber,
          paymentDate: body.paymentDate ?? new Date(),
          recordedBy: req.user!.id,
        },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } } },
      });
    });

    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'PAYMENT_RECORDED', entityType: 'Payment', entityId: payment.id, newValues: { amount: body.amount, receiptNumber: payment.receiptNumber } });
    res.status(201).json(payment);
  })
);

/** GET /api/finance/payments — list/search payments. */
router.get(
  '/payments',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const { studentId, method, from, to, search } = req.query as Record<string, string | undefined>;
    const params = getPageParams(req);
    const where: Prisma.PaymentWhereInput = {
      schoolId: req.schoolId!,
      ...(studentId ? { studentId } : {}),
      ...(method ? { paymentMethod: method as PaymentMethod } : {}),
      ...(from || to
        ? { paymentDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { receiptNumber: { contains: search, mode: 'insensitive' } },
              { referenceNumber: { contains: search, mode: 'insensitive' } },
              { student: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { admissionNumber: { contains: search, mode: 'insensitive' } }] } },
            ],
          }
        : {}),
    };
    const [items, total, sum] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } }, adjustments: true },
        orderBy: { paymentDate: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    res.json({ ...pageResult(items, total, params), totalAmount: sum._sum.amount ?? 0 });
  })
);

/** GET /api/finance/payments/:id/receipt — receipt payload for printing. */
router.get(
  '/payments/:id/receipt',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId! },
      include: {
        student: { select: { firstName: true, middleName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } },
        school: { select: { name: true, address: true, phone: true, logoUrl: true, settings: { select: { currency: true, motto: true } } } },
        adjustments: true,
      },
    });
    if (!payment) throw notFound('Payment not found');
    res.json(payment);
  })
);

const adjustmentSchema = z.object({
  reason: z.string().min(1).max(300),
  amountDifference: z.number(),
});

/** POST /api/finance/payments/:id/adjustments — corrections (payments themselves are immutable). */
router.post(
  '/payments/:id/adjustments',
  requireRoles(...WRITE),
  asyncHandler(async (req, res) => {
    const body = adjustmentSchema.parse(req.body);
    const payment = await prisma.payment.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!payment) throw notFound('Payment not found');

    const adjustment = await prisma.paymentAdjustment.create({
      data: {
        paymentId: payment.id,
        reason: body.reason,
        amountDifference: new Prisma.Decimal(body.amountDifference),
        createdBy: req.user!.id,
      },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'PAYMENT_ADJUSTED', entityType: 'Payment', entityId: payment.id, newValues: body });
    res.status(201).json(adjustment);
  })
);

// ---------------- Balances ----------------

/**
 * GET /api/finance/balances?termId= — outstanding balances per active student.
 * Expected = fee structure for the student's class & term.
 * Paid = payments within the term window (+ adjustments).
 */
router.get(
  '/balances',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const termId = req.query.termId as string | undefined;
    const classId = req.query.classId as string | undefined;
    const term = termId
      ? await prisma.term.findFirst({ where: { id: termId, schoolId: req.schoolId! } })
      : await prisma.term.findFirst({ where: { schoolId: req.schoolId!, isActive: true } });
    if (!term) throw badRequest('No term specified and no active term found');

    const [students, feeStructures] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId: req.schoolId!, status: 'ACTIVE', ...(classId ? { classId } : {}) },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, classId: true, class: { select: { name: true } } },
      }),
      prisma.feeStructure.findMany({ where: { schoolId: req.schoolId!, termId: term.id } }),
    ]);
    const feeByClass = new Map(feeStructures.map((f) => [f.classId, Number(f.amount)]));

    const paid = await prisma.payment.groupBy({
      by: ['studentId'],
      where: { schoolId: req.schoolId!, paymentDate: { gte: term.startDate, lte: term.endDate } },
      _sum: { amount: true },
    });
    const paidByStudent = new Map(paid.map((p) => [p.studentId, Number(p._sum.amount ?? 0)]));

    const adjustments = await prisma.paymentAdjustment.groupBy({
      by: ['paymentId'],
      where: { payment: { schoolId: req.schoolId!, paymentDate: { gte: term.startDate, lte: term.endDate } } },
      _sum: { amountDifference: true },
    });
    // Map adjustments back to students.
    if (adjustments.length > 0) {
      const adjPayments = await prisma.payment.findMany({
        where: { id: { in: adjustments.map((a) => a.paymentId) } },
        select: { id: true, studentId: true },
      });
      const studentByPayment = new Map(adjPayments.map((p) => [p.id, p.studentId]));
      for (const adj of adjustments) {
        const studentId = studentByPayment.get(adj.paymentId);
        if (studentId) {
          paidByStudent.set(studentId, (paidByStudent.get(studentId) ?? 0) + Number(adj._sum.amountDifference ?? 0));
        }
      }
    }

    const balances = students.map((s) => {
      const expected = s.classId ? (feeByClass.get(s.classId) ?? 0) : 0;
      const paidAmount = paidByStudent.get(s.id) ?? 0;
      return {
        student: { id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNumber: s.admissionNumber, class: s.class?.name ?? null },
        expected,
        paid: paidAmount,
        balance: Math.round((expected - paidAmount) * 100) / 100,
      };
    });

    const totals = balances.reduce(
      (acc, b) => ({ expected: acc.expected + b.expected, paid: acc.paid + b.paid, outstanding: acc.outstanding + Math.max(0, b.balance) }),
      { expected: 0, paid: 0, outstanding: 0 }
    );

    res.json({ term: { id: term.id, name: term.name, year: term.year }, totals, balances });
  })
);

export default router;
