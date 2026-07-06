import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, forbidden, unauthorized } from './error';

/**
 * Session audiences — the two applications sharing this backend.
 * A token is minted for exactly one application and is rejected by the other.
 */
export const AUDIENCE = {
  SCHOOL: 'nisms:school',
  PLATFORM: 'nisms:platform',
} as const;
export type Audience = (typeof AUDIENCE)[keyof typeof AUDIENCE];

export const ISSUER = 'nisms-auth';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  schoolId: string | null;
  firstName: string;
  lastName: string;
  audience: Audience;
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

interface TokenClaims {
  sub: string;
  role: Role;
  schoolId: string | null;
  tokenVersion: number;
}

export function signToken(
  user: { id: string; role: Role; schoolId: string | null; tokenVersion: number },
  audience: Audience
): string {
  const claims: TokenClaims = {
    sub: user.id,
    role: user.role,
    schoolId: user.schoolId,
    tokenVersion: user.tokenVersion,
  };
  return jwt.sign(claims, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    audience,
    issuer: ISSUER,
  } as jwt.SignOptions);
}

export const PLATFORM_ROLES: Role[] = [Role.SUPER_ADMIN, Role.SUPPORT_ADMIN];

export function audienceForRole(role: Role): Audience {
  return PLATFORM_ROLES.includes(role) ? AUDIENCE.PLATFORM : AUDIENCE.SCHOOL;
}

/**
 * Validates the JWT (signature, issuer, audience, tokenVersion) and loads the
 * live user record so deactivated users, revoked sessions and suspended
 * schools are blocked immediately. Backend is the final authority (spec §7).
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();

  let claims: TokenClaims & { aud?: string };
  try {
    claims = jwt.verify(header.slice(7), env.jwtSecret, {
      issuer: ISSUER,
      audience: [AUDIENCE.SCHOOL, AUDIENCE.PLATFORM],
    }) as TokenClaims & { aud?: string };
  } catch {
    throw unauthorized('Invalid or expired session');
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { school: { select: { status: true } } },
  });
  if (!user || !user.isActive) throw unauthorized('Account is inactive');
  if (user.tokenVersion !== claims.tokenVersion) throw unauthorized('Session has been revoked. Please sign in again.');
  if (user.schoolId && user.school && user.school.status === 'SUSPENDED') {
    throw forbidden('This account is currently suspended. Contact support.');
  }
  if (user.schoolId && user.school && user.school.status === 'CLOSED') {
    throw forbidden('This account is closed.');
  }

  const audience = claims.aud === AUDIENCE.PLATFORM ? AUDIENCE.PLATFORM : AUDIENCE.SCHOOL;
  // Defence in depth: the token's audience must match the account's domain.
  if (audience !== audienceForRole(user.role)) throw unauthorized('Invalid session');

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    firstName: user.firstName,
    lastName: user.lastName,
    audience,
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

/** Application A boundary: only platform (Natural Intellects) sessions pass. */
export function requirePlatformDomain(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) return next(unauthorized());
  if (user.audience !== AUDIENCE.PLATFORM) return next(forbidden());
  return next();
}

/**
 * Resolves the tenant (schoolId) for the request and enforces ownership:
 * - School users are locked to their own school; a mismatching context
 *   header is rejected.
 * - Platform staff are never "logged into" a school — they operate within an
 *   explicitly selected School Context, sent as the x-school-context header.
 *   Every action is audited as the platform user, on that school.
 */
export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) return next(unauthorized());

  const requested =
    (req.headers['x-school-context'] as string | undefined) ??
    (req.headers['x-school-id'] as string | undefined) ?? // legacy header, one release window
    (req.query.schoolId as string | undefined);

  if (user.schoolId) {
    if (requested && requested !== user.schoolId) {
      return next(forbidden('You cannot access another school\'s data'));
    }
    req.schoolId = user.schoolId;
    return next();
  }

  // Platform user operating within a School Context
  if (!requested) {
    return next(badRequest('Select a school first: the x-school-context header is required'));
  }
  req.schoolId = requested;
  return next();
}
