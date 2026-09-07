import { NextRequest } from 'next/server';
import { withAuth } from '@/middlewares/auth';
import { withCsrf } from '@/middlewares/csrf';
import { withRateLimit } from '@/middlewares/rate-limit';
import { successResponse } from '@/lib/utils/api-response';
import { ChannelManagerService } from '@/lib/services/channel-manager.service';

const channelService = new ChannelManagerService();

// Publishes (stores as a high-watermark stream) the availability + rate snapshot.
// A future BullMQ job reads ChannelPriceSnapshot and pushes changes to the OTA API.
async function handler(request: NextRequest) {
  const user = (request as any).user;
  const body = await request.json();
  const provider = String(body.provider || 'BOOKING_COM');
  const from = body.from ? new Date(String(body.from) + 'T00:00:00') : new Date();
  const to = body.to
    ? new Date(String(body.to) + 'T00:00:00')
    : new Date(Date.now() + 7 * 86400000);

  const context = await channelService.buildAvailabilitySnapshot(user.hotelId, provider, from, to);
  await channelService.storeSnapshots(user.hotelId, provider, context.snapshots);

  return successResponse({
    published: context.snapshots.length,
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  });
}

export const POST = withAuth(withCsrf(withRateLimit(handler)), ['ADMIN', 'MANAGER']);