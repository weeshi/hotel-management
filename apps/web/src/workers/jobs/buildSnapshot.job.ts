import { Job, JobsOptions } from 'bullmq';
import { prisma } from '@/lib/utils/prisma';
import { ChannelManagerService } from '@/lib/services/channel-manager.service';
import { queues, formatLocalDate, enqueuePublishJobs } from '@/workers/queue';
import { JOB_PRIORITY } from '@/lib/bullmq';

const BATCH_SIZE = 200; // days per batch for cursor pagination
const MAX_DAYS_PER_RUN = 365; // safety cap

interface BuildSnapshotData {
  hotelId?: string;        // optional: specific hotel (for manual runs)
  provider?: string;       // optional: specific provider (for manual runs)
  from?: string;           // optional: ISO date string (default: today)
  to?: string;             // optional: ISO date string (default: +30 days)
  cursor?: string;         // internal: ISO date for pagination
  processedHotels?: string[]; // internal: hotels already processed
}

interface SnapshotResult {
  hotelId: string;
  provider: string;
  snapshotsStored: number;
  jobsEnqueued: number;
}

/**
 * Processor for `buildSnapshot` job.
 * Iterates hotels with enabled mappings, builds availability snapshots in chunks,
 * stores them in ChannelPriceSnapshot, and enqueues pushToOTA jobs for each date.
 */
export async function buildSnapshotProcessor(job: Job<BuildSnapshotData>): Promise<SnapshotResult> {
  const { hotelId, provider, from, to, cursor, processedHotels = [] } = job.data;
  const startDate = from ? new Date(from + 'T00:00:00') : new Date();
  const endDate = to ? new Date(to + 'T00:00:00') : new Date(Date.now() + 30 * 86400000);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
    throw new Error('نطاق التواريخ غير صالح');
  }

  const totalDays = Math.min(
    Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
    MAX_DAYS_PER_RUN
  );

  let cursorDate = cursor ? new Date(cursor) : startDate;
  if (Number.isNaN(cursorDate.getTime())) cursorDate = startDate;

  const cmService = new ChannelManagerService();
  let totalSnapshotsStored = 0;
  let totalJobsEnqueued = 0;

  // Find hotels that have at least one enabled channel mapping for the provider (or any if not specified)
  const hotelWhere: any = {};
  if (hotelId) {
    hotelWhere.id = hotelId;
  } else {
    // Hotels with enabled mappings
    hotelWhere.channelMappings = {
      some: {
        enabled: true,
        ...(provider ? { provider: provider as any } : {}),
      },
    };
  }

  const hotels = await prisma.hotel.findMany({
    where: hotelWhere,
    select: { id: true, name: true },
    take: 50, // process up to 50 hotels per job run
  });

  if (hotels.length === 0) {
    console.log('[buildSnapshot] No hotels with enabled mappings found');
    return { hotelId: '', provider: '', snapshotsStored: 0, jobsEnqueued: 0 };
  }

  for (const hotel of hotels) {
    if (processedHotels.includes(hotel.id)) continue;

    const providers = provider
      ? [provider]
      : (
          await prisma.channelMapping.findMany({
            where: { hotelId: hotel.id, enabled: true },
            select: { provider: true },
            distinct: ['provider'],
          })
        ).map((m) => m.provider);

    for (const prov of providers) {
      // Build snapshots for this hotel+provider in date chunks
      const daysLeft = Math.min(
        Math.ceil((endDate.getTime() - cursorDate.getTime()) / 86400000),
        BATCH_SIZE
      );
      if (daysLeft <= 0) continue;

      const chunkEnd = new Date(cursorDate.getTime() + daysLeft * 86400000);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      console.log(
        `[buildSnapshot] hotel=${hotel.id} provider=${prov} range=${formatLocalDate(cursorDate)}..${formatLocalDate(chunkEnd)}`
      );

      const { snapshots } = await cmService.buildAvailabilitySnapshot(
        hotel.id,
        prov,
        cursorDate,
        chunkEnd
      );

      if (snapshots.length > 0) {
        // Store snapshots in DB (high-watermark stream)
        await cmService.storeSnapshots(hotel.id, prov, snapshots);
        totalSnapshotsStored += snapshots.length;

        // Enqueue pushToOTA jobs for each snapshot
        const enqueueResult = await enqueuePublishJobs({
          hotelId: hotel.id,
          provider: prov,
          from: cursorDate,
          to: chunkEnd,
        });
        totalJobsEnqueued += enqueueResult.accepted;
      }

      // Advance cursor
      cursorDate = new Date(chunkEnd.getTime() + 86400000);
    }

    processedHotels.push(hotel.id);
  }

  // If more days to process or more hotels, re-enqueue self with updated cursor
  const hasMoreDays = cursorDate < endDate;
  const hasMoreHotels = hotels.length >= 50; // we hit the limit
  const nextHotelId = hasMoreHotels ? undefined : hotelId;

  if (hasMoreDays || hasMoreHotels) {
    const nextData: BuildSnapshotData = {
      hotelId: nextHotelId,
      provider,
      from: formatLocalDate(startDate),
      to: formatLocalDate(endDate),
      cursor: formatLocalDate(cursorDate),
      processedHotels,
    };
    await queues.snapshot.add('buildSnapshot', nextData, {
      priority: JOB_PRIORITY.NORMAL,
      delay: 1000, // small delay to avoid tight loop
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 1000 },
    } as JobsOptions);
    console.log('[buildSnapshot] Re-enqueued self for continuation', { cursor: formatLocalDate(cursorDate) });
  }

  return {
    hotelId: hotelId || 'all',
    provider: provider || 'all',
    snapshotsStored: totalSnapshotsStored,
    jobsEnqueued: totalJobsEnqueued,
  };
}