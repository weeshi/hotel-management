import { prisma } from '@/lib/utils/prisma';

interface PlatformAuditInput {
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  entity?: string;
  entityId?: string;
  hotelId?: string;
  oldValue?: string;
  newValue?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Writes to the platform-wide audit ledger (`PlatformAuditLog`).
 *
 * Tenant `AuditLog` requires a `hotelId`; platform-scoped events (Super-Admin
 * OTP lifecycle, cross-tenant key management) have no single tenant, so they are
 * recorded here instead. Secrets and OTP codes are NEVER passed to this ledger —
 * only the action and its outcome.
 */
export async function recordPlatformAudit(input: PlatformAuditInput) {
  return prisma.platformAuditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: input.action,
      entity: input.entity ?? 'SUPER_ADMIN',
      entityId: input.entityId,
      hotelId: input.hotelId,
      oldValue: input.oldValue,
      newValue: input.newValue,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}
