import { Job } from 'bullmq';

export async function pushToOTAProcessor(job: Job): Promise<{ ok: boolean }> {
  console.log('[publish] placeholder:', job.id, job.data);
  return { ok: true };
}