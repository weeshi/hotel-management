import pino, { type Logger, type LoggerOptions } from 'pino';
import { getTenantContext } from '@/lib/tenant/runtime-context';

/**
 * M9 — Pino logger with automatic tenant attribution.
 *
 * Every log line is JSON and carries a `hotelId` (TENANT span) or
 * `actor: "PLATFORM"` (platform-wide span) read from the SAME AsyncLocalStorage
 * that drives RLS — so logs never drift from the tenancy that produced them.
 *
 * NEVER import this module from files bundled for the Edge runtime (jwt, otp,
 * tenant utils, prisma, middleware): pino requires Node streams at import time.
 */

const REDACT_PATHS = [
  'authorization',
  'cookie',
  'password',
  'apiKeyEnc',
  'secret',
  '*.secret',
  'vccToken',
  '*.vccToken',
  'cardNumber',
  'cvv',
];

const BASE_OPTIONS: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'hotel-web' },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const base = pino(BASE_OPTIONS);

export function childLogger(bindings?: Record<string, unknown>): Logger {
  const ctx = getTenantContext();
  const tenancy =
    !ctx ? {} : ctx.mode === 'TENANT' ? { hotelId: ctx.hotelId } : { actor: 'PLATFORM' };
  return base.child({ ...tenancy, ...bindings });
}

export const logger: Logger = base;