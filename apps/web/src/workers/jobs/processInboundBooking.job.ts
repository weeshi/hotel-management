import { Job } from 'bullmq';

export async function processInboundBookingProcessor(job: Job): Promise<{ ok: boolean }> {
  console.log('[ingest] placeholder:', job.id, job.data);
  return { ok: true };
}