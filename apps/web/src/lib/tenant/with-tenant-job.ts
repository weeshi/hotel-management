import type { Job } from 'bullmq';
import { runWithTenant } from './runtime-context';

/**
 * M8 — Binds a background-job processor to a tenancy context:
 *   - `job.data.hotelId` present → runs as app_tenant for that hotel (RLS),
 *   - otherwise → runs as app_platform BYPASSRLS (cross-hotel/global work,
 *     trusted internal code that always writes hotelId explicitly).
 *
 * Every processor in `src/workers/index.ts` MUST be wrapped with this so a
 * job can never touch hotel-scoped tables without a context (which RLS would
 * fail closed — silent zero rows). Readings/mutations then go through the
 * prisma interceptor, whose no-context guard is a Hard Throw for mutators.
 */
export function withTenantJob<TData = unknown, TResult = void>(
  processor: (job: Job<TData, TResult>) => Promise<TResult>
): (job: Job<TData, TResult>) => Promise<TResult> {
  return (job) => {
    const hotelId = (job.data as { hotelId?: string } | undefined)?.hotelId;
    if (hotelId) {
      return runWithTenant({ mode: 'TENANT', hotelId }, () => processor(job));
    }
    return runWithTenant({ mode: 'PLATFORM' }, () => processor(job));
  };
}