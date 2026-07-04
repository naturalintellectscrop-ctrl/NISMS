import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

interface AuditEntry {
  schoolId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
}

/** Fire-and-forget audit trail (Doc 07 §10). Failures never break the request. */
export function audit(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        schoolId: entry.schoolId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: entry.oldValues === undefined ? Prisma.DbNull : (entry.oldValues as Prisma.InputJsonValue),
        newValues: entry.newValues === undefined ? Prisma.DbNull : (entry.newValues as Prisma.InputJsonValue),
      },
    })
    .catch((err) => console.error('[NISMS] Audit log write failed:', err));
}
