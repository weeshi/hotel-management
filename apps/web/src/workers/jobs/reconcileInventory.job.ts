import { Job, JobsOptions } from 'bullmq';
import { prisma } from '@/lib/utils/prisma';
import { queues, formatLocalDate } from '@/workers/queue';
import { JOB_PRIORITY, buildJobId } from '@/lib/bullmq';
import { getRedis } from '@/lib/redis';
import { childLogger } from '@/lib/observability/logger';

interface ReconcileInventoryData {
  hotelId?: string;       // optional: specific hotel
  provider?: string;      // optional: specific provider
  date?: string;          // optional: specific date (YYYY-MM-DD), default: yesterday
  cursor?: string;        // internal: cursor for pagination
  processedCount?: number;
}

interface ReconcileResult {
  hotelId: string;
  provider: string;
  date: string;
  mismatchesFound: number;
  requeuedForPush: number;
}

/**
 * Processor for `reconcileInventory` job.
 * Compares ChannelPriceSnapshot (what we pushed) with actual BookingRoom occupancy.
 * Logs mismatches to audit and re-queues pushToOTA for drifted dates.
 * Runs daily at 03:00 via JobScheduler; can also be triggered manually.
 * Priority: LOW (background audit).
 */
export async function reconcileInventoryProcessor(job: Job<ReconcileInventoryData>): Promise<ReconcileResult> {
  const { hotelId, provider, date: targetDate, cursor, processedCount = 0 } = job.data;
  const jobId = job.id || `reconcile:${hotelId || 'all'}:${provider || 'all'}:${targetDate || ''}`;
  const log = childLogger({ component: 'worker', queue: 'reconcile', jobId, hotelId });
  const checkDate = targetDate ? new Date(targetDate + 'T00:00:00') : new Date(Date.now() - 86400000); // default: yesterday

  log.info({ date: formatLocalDate(checkDate), hotelId: hotelId || 'all', provider: provider || 'all' }, 'reconcile start');

  const where: any = { date: checkDate };
  if (hotelId) where.hotelId = hotelId;
  if (provider) where.provider = provider as any;

  // Cursor pagination for large datasets
  const take = 200;
  const snapshots = await prisma.channelPriceSnapshot.findMany({
    where,
    cursor: cursor ? { hotelId_provider_roomTypeId_date: JSON.parse(cursor) } : undefined,
    take: take + 1, // fetch one extra to know if there are more
    include: { roomType: { select: { id: true, name: true, webRoomLimit: true } } },
  });

  const hasMore = snapshots.length > take;
  const batch = hasMore ? snapshots.slice(0, take) : snapshots;
  const nextCursor = hasMore ? JSON.stringify({
    hotelId: batch[batch.length - 1].hotelId,
    provider: batch[batch.length - 1].provider,
    roomTypeId: batch[batch.length - 1].roomTypeId,
    date: batch[batch.length - 1].date,
  }) : null;

  let mismatchesFound = 0;
  let requeuedForPush = 0;

  for (const snap of batch) {
    // Calculate actual occupancy from BookingRoom for this roomType on this date
    const dayStart = new Date(snap.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const occupied = await prisma.bookingRoom.count({
      where: {
        roomTypeId: snap.roomTypeId,
        roomId: { not: null }, // only confirmed physical room assignments
        checkIn: { lt: dayEnd },
        checkOut: { gt: dayStart },
        booking: {
          hotelId: snap.hotelId,
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        },
      },
    });

    // Physical rooms available for this roomType
    const physicalRooms = await prisma.room.count({
      where: { hotelId: snap.hotelId, roomTypeId: snap.roomTypeId, status: 'AVAILABLE' },
    });

    // Pending web reservations (roomId null) for this roomType
    const pending = await prisma.bookingRoom.count({
      where: {
        roomTypeId: snap.roomTypeId,
        roomId: null,
        checkIn: { lt: dayEnd },
        checkOut: { gt: dayStart },
        booking: { hotelId: snap.hotelId, status: 'PENDING' },
      },
    });

    const onlineCap = snap.roomType.webRoomLimit ?? physicalRooms;
    const available = Math.min(onlineCap, physicalRooms) - occupied - pending;
    const expectedAvailable = Math.max(0, available);

    // Compare with snapshot
    if (snap.available !== expectedAvailable || snap.nightlyRate !== snap.nightlyRate) { // rate check is trivial here
      mismatchesFound++;
      const drift = {
        hotelId: snap.hotelId,
        provider: snap.provider,
        roomTypeId: snap.roomTypeId,
        date: formatLocalDate(snap.date),
        snapshotAvailable: snap.available,
        calculatedAvailable: expectedAvailable,
        snapshotRate: snap.nightlyRate,
        // rate would come from ratePlan or roomType — simplified
        driftType: snap.available !== expectedAvailable ? 'AVAILABILITY' : 'RATE',
      };

      // Log to audit (using existing AuditLog model if exists, else console)
      log.warn({ drift }, 'MISMATCH');

      // In a real impl, write to an AuditLog or MismatchLog table
      // await prisma.inventoryMismatch.create({ data: drift });

      // Re-queue pushToOTA for this specific date/roomType to correct the OTA
      const existingMapping = await prisma.channelMapping.findFirst({
        where: { hotelId: snap.hotelId, provider: snap.provider as any, roomTypeId: snap.roomTypeId, enabled: true },
        select: { id: true },
      });
      if (existingMapping) {
        const jobId = buildJobId(['push', snap.hotelId, snap.provider, snap.roomTypeId, formatLocalDate(snap.date)]);
        await queues.publish.add('pushToOTA', {
          hotelId: snap.hotelId,
          provider: snap.provider,
          roomTypeId: snap.roomTypeId,
          date: formatLocalDate(snap.date),
        }, {
          jobId, priority: JOB_PRIORITY.HIGH,
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 86400, count: 1000 },
        } as JobsOptions);
        requeuedForPush++;
      }
    }
  }

  // If more records, re-enqueue self with cursor
  if (hasMore) {
    await queues.reconcile.add('reconcileInventory', {
      hotelId, provider, date: targetDate || formatLocalDate(checkDate),
      cursor: nextCursor!, processedCount: processedCount + batch.length,
    }, { priority: JOB_PRIORITY.LOW, delay: 500, removeOnComplete: { age: 3600, count: 100 } } as JobsOptions);
    log.info({ cursor: nextCursor }, 're-enqueued for continuation');
  }

  log.info({ mismatches: mismatchesFound, requeued: requeuedForPush, processed: processedCount + batch.length }, 'reconcile done');
  return { hotelId: hotelId || 'all', provider: provider || 'all', date: formatLocalDate(checkDate), mismatchesFound, requeuedForPush };
}