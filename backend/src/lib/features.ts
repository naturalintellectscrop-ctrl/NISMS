import { prisma } from './prisma';

/**
 * Central feature registry. New features are registered here once,
 * mapped to plans, then toggled per school from the Control Center.
 */
export const FEATURES = {
  STUDENTS: 'STUDENTS',
  TEACHERS: 'TEACHERS',
  ATTENDANCE: 'ATTENDANCE',
  ACADEMICS: 'ACADEMICS', // exams, marks, report cards
  FEES: 'FEES',
  ANNOUNCEMENTS: 'ANNOUNCEMENTS',
  WEBSITE: 'WEBSITE', // CMS: news, gallery, pages
  LIBRARY: 'LIBRARY',
  SMS: 'SMS',
  PARENT_PORTAL: 'PARENT_PORTAL',
  ADVANCED_REPORTS: 'ADVANCED_REPORTS',
  INVENTORY: 'INVENTORY',
  HOSTEL: 'HOSTEL',
  ANALYTICS: 'ANALYTICS',
  API_ACCESS: 'API_ACCESS',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

export const ALL_FEATURE_KEYS = Object.values(FEATURES) as FeatureKey[];

/** Plan → features mapping (Doc 11 §4). Upgrades only change DB rows, never code. */
export const PLAN_FEATURES: Record<'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE', FeatureKey[]> = {
  STARTER: [
    FEATURES.STUDENTS,
    FEATURES.TEACHERS,
    FEATURES.ATTENDANCE,
    FEATURES.ACADEMICS,
    FEATURES.FEES,
    FEATURES.ANNOUNCEMENTS,
    FEATURES.WEBSITE,
  ],
  PROFESSIONAL: [
    FEATURES.STUDENTS,
    FEATURES.TEACHERS,
    FEATURES.ATTENDANCE,
    FEATURES.ACADEMICS,
    FEATURES.FEES,
    FEATURES.ANNOUNCEMENTS,
    FEATURES.WEBSITE,
    FEATURES.LIBRARY,
    FEATURES.SMS,
    FEATURES.PARENT_PORTAL,
    FEATURES.ADVANCED_REPORTS,
  ],
  ENTERPRISE: [...ALL_FEATURE_KEYS],
};

/** In-memory cache: schoolId → { features, expiresAt }. Invalidated on toggle. */
const cache = new Map<string, { features: Record<string, boolean>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export function invalidateFeatureCache(schoolId: string): void {
  cache.delete(schoolId);
}

/** Returns the full feature map for a school, e.g. { STUDENTS: true, SMS: false }. */
export async function getSchoolFeatures(schoolId: string): Promise<Record<string, boolean>> {
  const cached = cache.get(schoolId);
  if (cached && cached.expiresAt > Date.now()) return cached.features;

  const rows = await prisma.schoolFeature.findMany({ where: { schoolId } });
  const features: Record<string, boolean> = {};
  for (const key of ALL_FEATURE_KEYS) features[key] = false;
  for (const row of rows) features[row.featureKey] = row.isEnabled;

  cache.set(schoolId, { features, expiresAt: Date.now() + CACHE_TTL_MS });
  return features;
}

/** The core feature access engine (master prompt §5). Used by ALL feature-gated routes. */
export async function hasFeature(schoolId: string, featureKey: FeatureKey): Promise<boolean> {
  const features = await getSchoolFeatures(schoolId);
  return features[featureKey] === true;
}

/**
 * Applies a plan's feature set to a school: enables plan features,
 * disables everything outside the plan (data retained, access locked).
 */
export async function applyPlanFeatures(
  schoolId: string,
  plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
): Promise<void> {
  const enabled = new Set<string>(PLAN_FEATURES[plan]);
  await prisma.$transaction(
    ALL_FEATURE_KEYS.map((featureKey) =>
      prisma.schoolFeature.upsert({
        where: { schoolId_featureKey: { schoolId, featureKey } },
        create: { schoolId, featureKey, isEnabled: enabled.has(featureKey) },
        update: { isEnabled: enabled.has(featureKey) },
      })
    )
  );
  invalidateFeatureCache(schoolId);
}
