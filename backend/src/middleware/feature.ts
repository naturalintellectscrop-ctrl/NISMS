import { NextFunction, Request, Response } from 'express';
import { FeatureKey, hasFeature } from '../lib/features';
import { asyncHandler, forbidden } from './error';

/**
 * Feature flag enforcement (master prompt §5 / Doc 11 §7).
 * Blocks the request if the feature is disabled for the tenant school.
 * Must run after authenticate + tenantContext.
 */
export function requireFeature(featureKey: FeatureKey) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const schoolId = req.schoolId;
    if (!schoolId) throw forbidden('No school context');
    const enabled = await hasFeature(schoolId, featureKey);
    if (!enabled) {
      throw forbidden(`The ${featureKey} feature is not enabled for this school. Upgrade required.`);
    }
    next();
  });
}
