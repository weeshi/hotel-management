import { NextRequest } from 'next/server';
import { queueService } from '@/lib/queue';
import { withAuth } from '@/middlewares/auth';
import { withRateLimit } from '@/middlewares/rate-limit';
import { successResponse, errorResponse } from '@/lib/utils/api-response';

async function postHandler(request: NextRequest) {
  try {
    const processed = await queueService.processPending();
    return successResponse({ processed });
  } catch (error: any) {
    return errorResponse(error.message || 'ظپط´ظ„ ظ…ط¹ط§ظ„ط¬ط© ظ‚ط§ط¦ظ…ط© ط§ظ„ط§ظ†طھط¸ط§ط±');
  }
}

async function getHandler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { prisma } = await import('@/lib/utils/prisma');
    const where = { hotelId: user.hotelId };
    const pending = await prisma.notification.count({ where: { ...where, status: 'PENDING' } });
    const sent = await prisma.notification.count({ where: { ...where, status: 'SENT' } });
    const failed = await prisma.notification.count({ where: { ...where, status: 'FAILED' } });
    return successResponse({ pending, sent, failed });
  } catch (error: any) {
    return errorResponse(error.message);
  }
}

export const POST = withAuth(withRateLimit(postHandler), ['ADMIN', 'MANAGER']);
export const GET = withAuth(withRateLimit(getHandler), ['ADMIN', 'MANAGER']);
