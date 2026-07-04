import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { asyncHandler, forbidden, unauthorized } from './error';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  schoolId: string | null;
  firstName: string;
  lastName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      schoolId?: string;
    }
  }
}

export interface JwtPayload {
  sub: string;
  role: Role;
  schoolId: string | null;
}

export function signToken(user: { id: string; role: Role; schoolId: string | null }): string {
  const payload: JwtPayload = { sub: user.id, role: user.role, schoolId: user.schoolId };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export const PLATFORM_ROLES: Role[] = [Role.SUPER_ADMIN, Role.SUPPORT_ADMIN];

/**
 * Validates the JWT and loads the live user record so that deactivated
 * users and suspended schools are blocked immediately (backend is the
 * final authority — spec §7).
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();

  let payload: JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret) as JwtPayload;
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { school: { select: { status: true } } },
  });
  if (!user || !user.isActive) throw unauthorized('Account is inactive');
  if (user.schoolId && user.school && user.school.status === 'SUSPENDED') {
    throw forbidden('This school account is suspended. Contact Natural Intellects support.');
  }
  if (user.schoolId && user.school && user.school.status === 'CLOSED') {
    throw forbidden('This school account is closed.');
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    firstName: user.firstName,
    lastName: user.lastName,
  };
  next();
});

/**
 * Role-based access control. SUPER_ADMIN always passes (platform owner).
 */
export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(unauthorized());
    if (user.role === Role.SUPER_ADMIN || roles.includes(user.role)) return next();
    return next(forbidden());
  };
}

/**
 * Resolves the tenant (schoolId) for the request and enforces ownership:
 * - School-bound users are locked to their own school; a mismatching
 *   x-school-id header is rejected.
 * - Platform users (SUPER_ADMIN / SUPPORT_ADMIN) must specify the target
 *   school via the x-school-id header (or ?schoolId=).
 */
export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) return next(unauthorized());

  const requested = (req.headers['x-school-id'] as string | undefined) ?? (req.query.schoolId as string | undefined);

  if (user.schoolId) {
    if (requested && requested !== user.schoolId) {
      return next(forbidden('You cannot access another school\'s data'));
    }
    req.schoolId = user.schoolId;
    return next();
  }

  // Platform user acting on a school
  if (!requested) {
    return next(new Error('x-school-id header is required for platform users accessing school data'));
  }
  req.schoolId = requested;
  return next();
}
