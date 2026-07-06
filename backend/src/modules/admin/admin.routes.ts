import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PlanType, Prisma, Role, SchoolStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { ALL_FEATURE_KEYS, applyPlanFeatures, FeatureKey, getSchoolFeatures, invalidateFeatureCache, PLAN_FEATURES } from '../../lib/features';
import { authenticate, requirePlatformDomain, requireRoles } from '../../middleware/auth';
import { asyncHandler, badRequest, notFound } from '../../middleware/error';

/**
 * Natural Intellects Control Center — platform-level administration.
 * Application A boundary: platform sessions only, then SUPER_ADMIN
 * (SUPPORT_ADMIN gets read access where noted).
 */
const router = Router();
router.use(authenticate, requirePlatformDomain);

// ---------------- Schools management ----------------

const createSchoolSchema = z.object({
  name: z.string().min(1).max(200),
  shortName: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'shortName must be lowercase letters, numbers and hyphens'),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  address: z.string().max(300).optional(),
  planType: z.nativeEnum(PlanType).default(PlanType.STARTER),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
  }),
});

/**
 * POST /api/admin/schools — onboard a school: creates the school record,
 * its subscription, plan feature flags and the first SCHOOL_ADMIN account.
 */
router.post(
  '/schools',
  requireRoles(), // SUPER_ADMIN only (requireRoles always allows SUPER_ADMIN)
  asyncHandler(async (req, res) => {
    const body = createSchoolSchema.parse(req.body);

    const school = await prisma.$transaction(async (tx) => {
      const created = await tx.school.create({
        data: {
          name: body.name,
          shortName: body.shortName,
          email: body.email,
          phone: body.phone,
          address: body.address,
          status: SchoolStatus.ACTIVE,
          settings: { create: {} },
          subscription: {
            create: {
              planType: body.planType,
              renewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          },
        },
      });
      await tx.user.create({
        data: {
          schoolId: created.id,
          email: body.admin.email.toLowerCase(),
          passwordHash: await bcrypt.hash(body.admin.password, 10),
          role: Role.SCHOOL_ADMIN,
          firstName: body.admin.firstName,
          lastName: body.admin.lastName,
        },
      });
      return created;
    });

    await applyPlanFeatures(school.id, body.planType);
    audit({ userId: req.user!.id, action: 'SCHOOL_ONBOARDED', entityType: 'School', entityId: school.id, newValues: { name: body.name, plan: body.planType } });
    res.status(201).json({ ...school, features: await getSchoolFeatures(school.id) });
  })
);

/** GET /api/admin/schools — all schools with usage stats. */
router.get(
  '/schools',
  requireRoles(Role.SUPPORT_ADMIN),
  asyncHandler(async (_req, res) => {
    const schools = await prisma.school.findMany({
      include: {
        subscription: { select: { planType: true, status: true, renewalDate: true, paymentStatus: true } },
        _count: { select: { students: true, teachers: true, users: true, payments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(schools);
  })
);

/** GET /api/admin/schools/:id — school detail with features & recent activity. */
router.get(
  '/schools/:id',
  requireRoles(Role.SUPPORT_ADMIN),
  asyncHandler(async (req, res) => {
    const school = await prisma.school.findUnique({
      where: { id: req.params.id },
      include: {
        settings: true,
        subscription: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
        _count: { select: { students: true, teachers: true, users: true, payments: true } },
      },
    });
    if (!school) throw notFound('School not found');
    const [features, recentActivity] = await Promise.all([
      getSchoolFeatures(school.id),
      prisma.auditLog.findMany({ where: { schoolId: school.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    res.json({ ...school, features, recentActivity });
  })
);

const statusSchema = z.object({ status: z.nativeEnum(SchoolStatus) });

/** POST /api/admin/schools/:id/status — activate / suspend / close a school. */
router.post(
  '/schools/:id/status',
  requireRoles(),
  asyncHandler(async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const school = await prisma.school.update({ where: { id: req.params.id }, data: { status } });
    audit({ userId: req.user!.id, action: `SCHOOL_${status}`, entityType: 'School', entityId: school.id, newValues: { status } });
    res.json(school);
  })
);

// ---------------- Feature management ----------------

/** GET /api/admin/schools/:id/features — full feature matrix for a school. */
router.get(
  '/schools/:id/features',
  requireRoles(Role.SUPPORT_ADMIN),
  asyncHandler(async (req, res) => {
    const school = await prisma.school.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!school) throw notFound('School not found');
    res.json({ features: await getSchoolFeatures(school.id), registry: ALL_FEATURE_KEYS, planFeatures: PLAN_FEATURES });
  })
);

const toggleSchema = z.object({
  featureKey: z.string().refine((k) => (ALL_FEATURE_KEYS as string[]).includes(k), 'Unknown feature key'),
  isEnabled: z.boolean(),
});

/** POST /api/admin/schools/:id/features — toggle one feature (instant effect). */
router.post(
  '/schools/:id/features',
  requireRoles(),
  asyncHandler(async (req, res) => {
    const { featureKey, isEnabled } = toggleSchema.parse(req.body);
    const school = await prisma.school.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!school) throw notFound('School not found');

    await prisma.schoolFeature.upsert({
      where: { schoolId_featureKey: { schoolId: school.id, featureKey } },
      create: { schoolId: school.id, featureKey, isEnabled },
      update: { isEnabled },
    });
    invalidateFeatureCache(school.id);
    audit({ userId: req.user!.id, schoolId: school.id, action: 'FEATURE_TOGGLED', entityType: 'SchoolFeature', newValues: { featureKey, isEnabled } });
    res.json(await getSchoolFeatures(school.id));
  })
);

// ---------------- Subscription management ----------------

const planSchema = z.object({
  planType: z.nativeEnum(PlanType),
  amount: z.number().min(0).optional(),
  renewalDate: z.coerce.date().optional(),
});

/**
 * POST /api/admin/schools/:id/plan — upgrade/downgrade instantly.
 * Applies the plan's feature set; out-of-plan features are locked, data retained.
 */
router.post(
  '/schools/:id/plan',
  requireRoles(),
  asyncHandler(async (req, res) => {
    const body = planSchema.parse(req.body);
    const school = await prisma.school.findUnique({ where: { id: req.params.id }, include: { subscription: true } });
    if (!school) throw notFound('School not found');
    if (!school.subscription) throw badRequest('School has no subscription record');

    const subscription = await prisma.subscription.update({
      where: { schoolId: school.id },
      data: {
        planType: body.planType,
        amount: body.amount !== undefined ? new Prisma.Decimal(body.amount) : undefined,
        renewalDate: body.renewalDate,
        status: 'ACTIVE',
      },
    });
    await applyPlanFeatures(school.id, body.planType);
    audit({ userId: req.user!.id, schoolId: school.id, action: 'PLAN_CHANGED', entityType: 'Subscription', entityId: subscription.id, oldValues: { plan: school.subscription.planType }, newValues: { plan: body.planType } });
    res.json({ subscription, features: await getSchoolFeatures(school.id) });
  })
);

const billingSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(300),
  reference: z.string().max(100).optional(),
});

/** POST /api/admin/schools/:id/billing — record a subscription payment. */
router.post(
  '/schools/:id/billing',
  requireRoles(),
  asyncHandler(async (req, res) => {
    const body = billingSchema.parse(req.body);
    const subscription = await prisma.subscription.findUnique({ where: { schoolId: req.params.id } });
    if (!subscription) throw notFound('Subscription not found');

    const [transaction] = await prisma.$transaction([
      prisma.billingTransaction.create({
        data: { subscriptionId: subscription.id, amount: new Prisma.Decimal(body.amount), description: body.description, reference: body.reference },
      }),
      prisma.subscription.update({ where: { id: subscription.id }, data: { paymentStatus: 'PAID', status: 'ACTIVE' } }),
    ]);
    audit({ userId: req.user!.id, schoolId: req.params.id, action: 'BILLING_RECORDED', entityType: 'BillingTransaction', entityId: transaction.id, newValues: body });
    res.status(201).json(transaction);
  })
);

// ---------------- Analytics ----------------

/** GET /api/admin/analytics — platform-wide revenue, usage and activity. */
router.get(
  '/analytics',
  requireRoles(Role.SUPPORT_ADMIN),
  asyncHandler(async (_req, res) => {
    const [schoolsByStatus, schoolsByPlan, revenue, revenueByMonth, featureUsage, totals, recentActivity] = await Promise.all([
      prisma.school.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.subscription.groupBy({ by: ['planType'], _count: { planType: true } }),
      prisma.billingTransaction.aggregate({ _sum: { amount: true } }),
      prisma.$queryRaw<Array<{ month: string; total: number }>>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, SUM(amount)::float AS total
        FROM billing_transactions GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
      prisma.schoolFeature.groupBy({ by: ['featureKey'], where: { isEnabled: true }, _count: { featureKey: true } }),
      Promise.all([prisma.student.count(), prisma.teacher.count(), prisma.user.count(), prisma.payment.count()]),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { user: { select: { email: true, role: true } } } }),
    ]);

    res.json({
      schools: {
        byStatus: Object.fromEntries(schoolsByStatus.map((s) => [s.status, s._count.status])),
        byPlan: Object.fromEntries(schoolsByPlan.map((s) => [s.planType, s._count.planType])),
      },
      revenue: { total: revenue._sum.amount ?? 0, byMonth: revenueByMonth },
      featureUsage: Object.fromEntries(featureUsage.map((f) => [f.featureKey, f._count.featureKey])),
      totals: { students: totals[0], teachers: totals[1], users: totals[2], payments: totals[3] },
      recentActivity,
    });
  })
);

/** GET /api/admin/audit-logs — filterable system activity log. */
router.get(
  '/audit-logs',
  requireRoles(Role.SUPPORT_ADMIN),
  asyncHandler(async (req, res) => {
    const { schoolId, action } = req.query as Record<string, string | undefined>;
    res.json(
      await prisma.auditLog.findMany({
        where: { ...(schoolId ? { schoolId } : {}), ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}) },
        include: { user: { select: { email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    );
  })
);

export default router;
