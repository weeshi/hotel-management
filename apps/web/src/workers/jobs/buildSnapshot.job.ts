import { Job } from 'bullmq';

export async function buildSnapshotProcessor(job: Job): Promise<{ ok: boolean }> {
  console.log('[snapshot] placeholder:', job.id, job.data);
  return { ok: true };
}