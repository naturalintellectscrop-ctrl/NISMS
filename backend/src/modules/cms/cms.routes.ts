import { Router } from 'express';
import { z } from 'zod';
import { PageType, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { FEATURES, hasFeature } from '../../lib/features';
import { authenticate, requireRoles, tenantContext } from '../../middleware/auth';
import { requireFeature } from '../../middleware/feature';
import { asyncHandler, badRequest, forbidden, notFound } from '../../middleware/error';

const MANAGE = [Role.SCHOOL_ADMIN, Role.SECRETARY];

// ============================================================
// Authenticated CMS management routes
// ============================================================

const router = Router();
router.use(authenticate, tenantContext, requireFeature(FEATURES.WEBSITE));

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100);
}

const newsSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  featuredImage: z.string().url().optional().nullable(),
  publish: z.boolean().default(false),
});

/** POST /api/cms/news */
router.post(
  '/news',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = newsSchema.parse(req.body);
    const article = await prisma.newsArticle.create({
      data: {
        schoolId: req.schoolId!,
        title: body.title,
        slug: `${slugify(body.title)}-${Date.now().toString(36)}`,
        content: body.content,
        featuredImage: body.featuredImage ?? null,
        publishedAt: body.publish ? new Date() : null,
        createdBy: req.user!.id,
      },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'NEWS_CREATED', entityType: 'NewsArticle', entityId: article.id, newValues: { title: body.title } });
    res.status(201).json(article);
  })
);

/** GET /api/cms/news — all articles incl. drafts (management view). */
router.get(
  '/news',
  requireRoles(...MANAGE, Role.PROPRIETOR, Role.HEAD_TEACHER),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.newsArticle.findMany({
        where: { schoolId: req.schoolId! },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    );
  })
);

/** PATCH /api/cms/news/:id */
router.patch(
  '/news/:id',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = newsSchema.partial().parse(req.body);
    const existing = await prisma.newsArticle.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Article not found');
    const { publish, ...rest } = body;
    const article = await prisma.newsArticle.update({
      where: { id: existing.id },
      data: { ...rest, ...(publish !== undefined ? { publishedAt: publish ? new Date() : null } : {}) },
    });
    res.json(article);
  })
);

const gallerySchema = z.object({
  title: z.string().min(1).max(200),
  imageUrl: z.string().url(),
  description: z.string().max(500).optional().nullable(),
});

/** POST /api/cms/gallery */
router.post(
  '/gallery',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = gallerySchema.parse(req.body);
    const image = await prisma.galleryImage.create({ data: { ...body, schoolId: req.schoolId! } });
    res.status(201).json(image);
  })
);

/** GET /api/cms/gallery */
router.get(
  '/gallery',
  asyncHandler(async (req, res) => {
    res.json(await prisma.galleryImage.findMany({ where: { schoolId: req.schoolId! }, orderBy: { uploadedAt: 'desc' }, take: 200 }));
  })
);

/** DELETE /api/cms/gallery/:id */
router.delete(
  '/gallery/:id',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const existing = await prisma.galleryImage.findFirst({ where: { id: req.params.id, schoolId: req.schoolId! } });
    if (!existing) throw notFound('Image not found');
    await prisma.galleryImage.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);

const pageSchema = z.object({
  pageType: z.nativeEnum(PageType),
  content: z.record(z.unknown()), // structured sections: { hero: {...}, mission: "...", ... }
});

/** PUT /api/cms/pages — upsert an editable page (About, Admissions, ...). */
router.put(
  '/pages',
  requireRoles(...MANAGE),
  asyncHandler(async (req, res) => {
    const body = pageSchema.parse(req.body);
    const page = await prisma.pageContent.upsert({
      where: { schoolId_pageType: { schoolId: req.schoolId!, pageType: body.pageType } },
      create: { schoolId: req.schoolId!, pageType: body.pageType, content: body.content as object },
      update: { content: body.content as object },
    });
    audit({ schoolId: req.schoolId, userId: req.user!.id, action: 'PAGE_UPDATED', entityType: 'PageContent', entityId: page.id, newValues: { pageType: body.pageType } });
    res.json(page);
  })
);

/** GET /api/cms/pages */
router.get(
  '/pages',
  asyncHandler(async (req, res) => {
    res.json(await prisma.pageContent.findMany({ where: { schoolId: req.schoolId! } }));
  })
);

// ============================================================
// Public website routes (no auth — powers each school's site)
// ============================================================

export const publicRouter = Router();

/** Resolves the school from :shortName and verifies the WEBSITE feature. */
async function resolvePublicSchool(shortName: string) {
  const school = await prisma.school.findUnique({
    where: { shortName },
    select: { id: true, name: true, shortName: true, logoUrl: true, email: true, phone: true, address: true, status: true, settings: { select: { motto: true, primaryColor: true, secondaryColor: true } } },
  });
  if (!school || school.status === 'SUSPENDED' || school.status === 'CLOSED') throw notFound('School website not found');
  if (!(await hasFeature(school.id, FEATURES.WEBSITE))) throw forbidden('Website not available');
  return school;
}

/** GET /api/public/:shortName — school public profile + pages. */
publicRouter.get(
  '/:shortName',
  asyncHandler(async (req, res) => {
    const school = await resolvePublicSchool(req.params.shortName);
    const pages = await prisma.pageContent.findMany({ where: { schoolId: school.id } });
    res.json({ school, pages });
  })
);

/** GET /api/public/:shortName/news — published articles only. */
publicRouter.get(
  '/:shortName/news',
  asyncHandler(async (req, res) => {
    const school = await resolvePublicSchool(req.params.shortName);
    res.json(
      await prisma.newsArticle.findMany({
        where: { schoolId: school.id, publishedAt: { not: null } },
        select: { id: true, title: true, slug: true, content: true, featuredImage: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: 50,
      })
    );
  })
);

/** GET /api/public/:shortName/gallery */
publicRouter.get(
  '/:shortName/gallery',
  asyncHandler(async (req, res) => {
    const school = await resolvePublicSchool(req.params.shortName);
    res.json(await prisma.galleryImage.findMany({ where: { schoolId: school.id }, orderBy: { uploadedAt: 'desc' }, take: 100 }));
  })
);

export default router;
