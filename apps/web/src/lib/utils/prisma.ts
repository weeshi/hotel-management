import { PrismaClient } from '@prisma/client';

function createPrismaClient() {
  return new PrismaClient();
}

const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
