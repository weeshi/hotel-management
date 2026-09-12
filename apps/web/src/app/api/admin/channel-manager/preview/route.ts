import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth';
import { errorResponse, successResponse } from '@/lib/utils/api-response';
import { ChannelManagerService } from '@/lib/services/channel-manager.service';

const channelService = new ChannelManagerService();

async function handler(request: NextRequest) {
  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') || 'BOOKING_COM';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return errorResponse('from و to مطلوبان (YYYY-MM-DD)', 400);
    }

    const context = await channelService.buildAvailabilitySnapshot(
      user.hotelId,
      provider,
      new Date(from + 'T00:00:00'),
      new Date(to + 'T00:00:00')
    );

    return successResponse(
      context.snapshots.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        roomTypeId: s.roomTypeId,
        available: s.available,
        nightlyRate: s.nightlyRate,
      }))
    );
  } catch (e: any) {
    return errorResponse(e.message || 'فشل توليد التوفر', 400);
  }
}

export const GET = withAuth(handler, ['ADMIN', 'MANAGER']);