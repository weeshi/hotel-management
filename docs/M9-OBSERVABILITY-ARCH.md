# M9 — Observability & Background Jobs Architecture

**Released:** v9.0 (release branch `release/V3.12-Updates`)

M9 adds a unified structured logging layer (pino), a dedicated outbound **webhook**
bull-mq queue, one dead-letter queue (**DLQ**) for every finally-failed job, native
jittered backoff, a relocated **Bull Board** console secured under Super-Admin 2FA,
and liveness/readiness probes including an automated RLS census.

---

## 1. Structured Logging (`src/lib/observability/logger.ts`)

- `logger` — a pino instance (`level: LOG_LEVEL ?? 'info'`) that never writes a
  token, password, or auth header to stdout:
  redact paths include `authorization`, `cookie`, `password`, `apiKeyEnc`,
  `secret`, `vccToken`, `vccExpiryToken`, `vccCVVToken`, `cardNumber`, `cvv`.
- `childLogger(bindings?)` — derives a child logger and **implicitly binds tenant
  context** from the AsyncLocalStorage `getTenantContext()`:
  - `TENANT` → `{ hotelId }`
  - `PLATFORM` / `NONE` → `{ actor: 'PLATFORM' }`
  So workers and API modules get `hotelId` on every log line automatically when
  they run inside `withTenantJob` / `runWithTenant`.

### Edge-safety invariant (non-negotiable)

The **edge bundle** is `middleware.ts → @/lib/utils/jwt (+ otp) +
@/lib/utils/tenant → @/lib/utils/prisma`. `prisma.ts` must stay free of pino
imports (its intentional `console.warn` at the RLS client selection stays).
Everything else that was converted (`redis.ts`, `rate-limiter.ts`,
`integrations/*`, `workers/*`, `queue/index.ts`, `email.gateway.ts`) is
**outside** the edge graph, so it is safe to import pino there.

### Converted modules (console.* → pino)

- `src/lib/redis.ts`
- `src/workers/index.ts` (worker lifecycle + health server)
- `src/workers/queue.ts`
- `src/workers/jobs/{buildSnapshot,pushToOTA,processInboundBooking,pushRatePlan,reconcileInventory,purgeVCC,webhookDelivery}.job.ts`
- `src/lib/queue/index.ts`
- `src/lib/gateways/email.gateway.ts`
- `src/lib/integrations/vgs-client.ts`
- `src/lib/integrations/gateways/{tlync,plutu}-client.ts`

Every job processor creates `const log = childLogger({ component: 'worker',
queue, jobId, hotelId })` so a single span can be traced from enqueue to terminal
state.

---

## 2. Queue Topology (`src/lib/bullmq.ts`, `src/workers/queue.ts`)

`QUEUE_CONFIGS` now has **8 entries**:

| Index | key | bull-queue name | concurrency | processor |
|-------|-----|-----------------|-------------|-----------|
| 0 | snapshot | `cm-availability-snapshot` | 2 | `buildSnapshot` |
| 1 | publish | `cm-availability-publish` | 1 | `pushToOTA` |
| 2 | ingest | `cm-booking-ingest` | 3 | `processInboundBooking` |
| 3 | rates | `cm-rates-push` | 1 | `pushRatePlan` |
| 4 | reconcile | `cm-inventory-reconcile` | 1 | `reconcileInventory` |
| 5 | purge | `cm-vcc-purge` | 2 | `purgeVCC` |
| 6 | **webhook** | `cm-webhook-delivery` | 1 | `webhookDelivery` (new) |
| 7 | **dlq** | `cm-dlq` | 1 | **none** (dead letters only) |

### Default job options

- `attempts: 5` (was 3)
- `backoff: { type: 'exponential', delay: 5000, jitter: 0.2 }`
  Jitter uses bull-mq's **native** `jitter` option (no custom strategy), so a
  transient provider outage retries spread instead of stampeding in lockstep.

### Webhook lane (`src/workers/jobs/webhookDelivery.job.ts`)

`enqueueWebhookDelivery({ hotelId, provider, url, method, headers, body })` in
`queue.ts` uses an idempotent `jobId = webhook:{hotel}:{provider}:{url}` so
re-delivery never stacks while a delivery is in flight.

The processor:
- `MAX_ATTEMPTS = 5`, registered through `withTenantJob` (own RLS context).
- Per-`hotel × provider` rate limit (`60 / min` via `checkRateLimit`).
- 30s fetch timeout; 429/503 honors `Retry-After`; 5xx retries.
- **4xx = fatal, no retry** (bad request/auth/not-found survive to DLQ for manual
  replay from Bull Board).
- Self re-enqueue with `jobId: ${job.id}:retry${nextAttempt}` + delay.

### Dead-letter queue (`DLQ_QUEUE_CONFIG`)

- Single unified DLQ (`cm-dlq`), no processor — Bull Board surfaces one "dead
  letters" surface and replay is one `Retry` click away.
- `moveToDlq(origin, job, err)` writes `{ originQueue, originalJobId,
  originalJobName, originalData, attemptsMade, failedReason, stacktrace,
  failedAt }`.
- Wired in `src/workers/index.ts` `worker.on('failed', …)` **only when
  `attemptsMade >= attempts`** (final failure), so intermediate retries are not
  spammed into the DLQ.

---

## 3. Bull Board → `/superadmin/jobs`

- Moved from `/admin/queues` to the Super-Admin area.
- `src/lib/bullBoard.ts` registers **all eight** queues (`BullMQAdapter`).
- New route `src/app/(superadmin)/superadmin/jobs/[[...path]]/route.ts`
  (nodejs runtime, `requireSuperAdminCookie` guard).
- Old `/admin/queues` route deleted.
- `next.config.js` `outputFileTracingIncludes` points at `/superadmin/jobs/*`
  so the `@bull-board/ui` static assets ship in the production trace.
- Middleware comment and the two nav menus (`shell.tsx` +
  `(dashboard)/layout.tsx`) updated; `/superadmin/jobs` is covered by the
  existing `/superadmin` guard (role `SUPER_ADMIN` + `tv === true`).

---

## 4. Liveness / Readiness

- `GET /api/health` — liveness (service up), `force-dynamic`.
- `GET /api/ready` — readiness (`nodejs` runtime), returns 200/503:
  1. PostgreSQL `SELECT 1` under `runWithTenant({ mode: 'PLATFORM' })`.
  2. Redis `PING`.
  3. `getQueueHealth()` across all 8 queues (waiting/active/failed).
  4. **RLS census** via the exported `runRlsCensus(url)` extracted into
     `scripts/verify-rls.ts` (54 tenant_isolation / 0 tenant_derived / 5
     allow_all / 59 FORCE RLS / 19 triggers). `verifyRls(url)` is preserved for
     the `e2e-prepare-db.ts` bootstrap chain, and the script keeps its
     `require.main === module` guard.

---

## 5. Files

| Path | Change |
|------|--------|
| `src/lib/observability/logger.ts` | new — pino + `childLogger` with tenant bindings |
| `src/lib/bullmq.ts` | attempts 5, native jitter, `DLQ_QUEUE_CONFIG`, webhook+dlq in `QUEUE_CONFIGS` |
| `src/workers/queue.ts` | 8 queues, `enqueueWebhookDelivery`, `moveToDlq`, health covers all |
| `src/workers/index.ts` | webhook processor, dlq excluded from consumption, DLQ move on final failure, pino |
| `src/workers/jobs/webhookDelivery.job.ts` | new processor (rate limit, Retry-After, self re-enqueue) |
| `src/workers/jobs/*.job.ts`, `queue/index.ts`, gateways, client | console.* → pino |
| `src/lib/bullBoard.ts` + `/superadmin/jobs/[[...path]]/route.ts` | Bull Board relocation + guard |
| `src/app/api/ready/route.ts`, `src/app/api/health/route.ts` | readiness + liveness |
| `scripts/verify-rls.ts` | `runRlsCensus` extracted (shared with `/api/ready`) |
| `next.config.js`, `shell.tsx`, `(dashboard)/layout.tsx`, `middleware.ts` | route/links updates |