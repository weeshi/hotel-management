import { Job } from 'bullmq';

export async function reconcileInventoryProcessor(job: Job): Promise<{ ok: boolean }> {
  console.log('[reconcile] placeholder:', job.id, job.data);
  return { ok: true };
}