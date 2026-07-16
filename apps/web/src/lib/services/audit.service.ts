import { prisma } from '@/lib/utils/prisma';

interface CreateAuditLogParams {
  hotelId: string;
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: string;
  newValue?: string;
  ip?: string;
  userAgent?: string;
}

export async function createAuditLog(params: CreateAuditLogParams) {
  return prisma.auditLog.create({ data: params });
}
