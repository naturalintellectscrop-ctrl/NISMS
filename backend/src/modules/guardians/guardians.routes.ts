import { Router } from 'express';
import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { FEATURES } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, notFound } from '../../middleware/error';
import { getPageParams, pageResult } from '../../utils/pagination';

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.STUDENTS));

const READ = [Role.SCHOOL_ADMIN, Role.PROPRIETOR, Role.HEAD_TEACHER, Role.SECRETARY, Role.BURSAR];
const WRITE = [Role.SCHOOL_ADMIN, Role.SECRETARY];

/** GET /api/guardians — search guardians. */
router.get(
  '/',
  requireRoles(...READ),
  asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined;
    const params = getPageParams(req);
    const where: Prisma.GuardianWhereInput = {
      schoolId: req.schoolId!,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.guardian.findMany({
        where,
        include: { students: { include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } } } },
        orderBy: { fullName: 'asc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.guardian.count({ where }),
    ]);
    res.json(pageResult(items, total, params));
  })
);

const updateGuardianSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  phoneNumber: z.string().min(7).max(20).optional(),
  alternativePhone: z.string().max(20).optional().nullable(),
  relationship: z.enum(['Father', 'Mother', 'Sponsor', 'Relative', 'Other']).optional(),
  address: z.string().max(300).optional().nullable(),
  occupation: z.string().max(100).optional().nullable(),
});

/** PATCH /api/guardians/:id */
router.patch(
  '/:id',
  requireRoles(...WRITE),
  asyncHandler(async (req, res) => {
    const body = updateGuardianSchema.parse(req.body);
    const existing = await prisma.guardian.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Guardian not found');
    const guardian = await prisma.guardian.update({ where: { id: existing.id }, data: body });
    res.json(guardian);
  })
);

export default router;
