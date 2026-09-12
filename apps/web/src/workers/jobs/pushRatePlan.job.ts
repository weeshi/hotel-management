import { Job } from 'bullmq';

export async function pushRatePlanProcessor(job: Job): Promise<{ ok: boolean }> {
  console.log('[rates] placeholder:', job.id, job.data);
  return { ok: true };
}