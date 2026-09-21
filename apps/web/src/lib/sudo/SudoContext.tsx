'use client';

import {
  createContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { addToast } from '@/lib/utils/toast';
import { StepUpModal, type StepUpPhase } from '@/components/superadmin/StepUpModal';
import type { ApiErrorResponse, ApiResponse } from '@/lib/utils/api-client';

/**
 * SA.7 — Sudo Mode elevation provider (docs/SUPER-ADMIN-ARCH.md §SA.6/§SA.7).
 *
 * Owns the client half of the Sudo Mode lifecycle. When a sudo-gated mutation
 * (POST/DELETE /api/superadmin/integrations via `withSudoMode`) is denied with
 * `403 STEP_UP_REQUIRED`, the mutation transparently:
 *   1. Opens the shared StepUpModal (exactly ONE — a lock guards the modal).
 *   2. POSTs /step-up/request (email OTP), then /step-up/verify with the code.
 *   3. Caches the returned `su_token` in module memory (never localStorage)
 *      with a 5-minute expiry.
 *   4. Replays the original request with `x-sudo-token`.
 *
 * Concurrency (the trap the frontend team flagged): `flowActiveRef` is the
 * single-flight lock. Any number of mutations denied while the lock is held —
 * double-save, save-then-delete — WAIT in `queueRef` and are all replayed after
 * ONE successful OTP. Token expiry (`403 STEP_UP_EXPIRED`) clears the cache and
 * restarts the flow once. Deliberately NOT a global fetch interceptor: sudo is
 * an intentional elevation, so pages opt in via `useSudoMutation()`.
 */

interface PendingSudoRequest {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}

export interface SudoMutationOptions {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
}

export interface SudoContextValue {
  /** Runs a sudo-gated mutation, transparently elevating once (single OTP). */
  sudoMutation: <T = any>(options: SudoMutationOptions) => Promise<ApiResponse<T>>;
  /** True while the OTP challenge is on screen. */
  isSudoFlowActive: boolean;
}

export const SudoContext = createContext<SudoContextValue | null>(null);

const RESEND_COOLDOWN_MS = 60_000;

async function parseResponse<T>(res: Response): Promise<ApiResponse<T>> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as ApiResponse<T>;
  }
  if (res.ok) {
    return { success: true as const, data: (await res.text()) as any };
  }
  return { success: false as const, error: { message: await res.text() } };
}

export function SudoProvider({ children }: { children: ReactNode }) {
  // --- Module-memory token cache (SA.6 window-use, 5 minutes) ---
  const tokenRef = useRef<string | null>(null);
  const expiresAtRef = useRef(0);

  // --- Single-flight lock + replay queue (the concurrency trap) ---
  const flowActiveRef = useRef(false);
  const queueRef = useRef<PendingSudoRequest[]>([]);

  const [isSudoFlowActive, setIsSudoFlowActive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState<StepUpPhase>('ready');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState(300);
  const [resendUnlocksAt, setResendUnlocksAt] = useState(0);

  const settleQueue = useCallback((token: string | null) => {
    const pending = queueRef.current;
    queueRef.current = [];
    if (token) {
      for (const p of pending) p.resolve(token);
    } else {
      for (const p of pending) p.reject(new Error('Sudo flow cancelled'));
    }
  }, []);

  const closeFlow = useCallback(() => {
    flowActiveRef.current = false;
    setIsSudoFlowActive(false);
    setModalOpen(false);
    setPhase('ready');
    setError(null);
  }, []);

  /** Opens the modal and parks the caller until a token (or cancel) resolves. */
  const startFlow = useCallback((): Promise<string> => {
    flowActiveRef.current = true;
    setIsSudoFlowActive(true);
    setModalOpen(true);
    setPhase('sending');
    setError(null);
    return new Promise<string>((resolve, reject) => {
      queueRef.current.push({ resolve, reject });
    });
  }, []);

  /** First half: request the emailed step-up OTP. */
  const fireStepUpRequest = useCallback(async (): Promise<boolean> => {
    try {
      await getCsrfToken();
      const res = await fetch('/api/superadmin/auth/step-up/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: '{}',
      });
      const json = (await res.json()) as any;
      if (!json.success) {
        setError(json.error?.message ?? 'فشل إرسال رمز التحقق');
        setPhase('ready');
        return false;
      }
      setMaskedEmail(json.data?.sendToEmail ?? '');
      setExpiresIn(Number(json.data?.expiresIn ?? 300));
      setResendUnlocksAt(Date.now() + RESEND_COOLDOWN_MS);
      setPhase('ready');
      return true;
    } catch {
      setError('حدث خطأ في الاتصال');
      setPhase('ready');
      return false;
    }
  }, []);

  /** Second half (also the resend path): POST /step-up/verify with the code. */
  const verifyCode = useCallback(
    async (code: string): Promise<boolean> => {
      setPhase('verifying');
      setError(null);
      try {
        await getCsrfToken();
        const res = await fetch('/api/superadmin/auth/step-up/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ code }),
        });
        const json = (await res.json()) as any;
        if (!json.success) {
          setError(json.error?.message ?? 'رمز غير صحيح');
          setPhase('ready');
          return false;
        }
        tokenRef.current = json.data?.sudoToken as string;
        expiresAtRef.current = Date.now() + Number(json.data?.expiresIn ?? 300) * 1000;
        closeFlow();
        settleQueue(tokenRef.current);
        addToast('success', '🔓 تم تفعيل سودو مود — يمكنك مواصلة الإجراءات لـ 5 دقائق');
        return true;
      } catch {
        setError('حدث خطأ في الاتصال');
        setPhase('ready');
        return false;
      }
    },
    [closeFlow, settleQueue]
  );

  /** User dismissed the modal: every parked mutation is rejected. */
  const cancelFlow = useCallback(() => {
    if (!flowActiveRef.current) return;
    closeFlow();
    settleQueue(null);
  }, [closeFlow, settleQueue]);

  const resendCode = useCallback(async () => {
    setPhase('sending');
    setError(null);
    await fireStepUpRequest();
  }, [fireStepUpRequest]);

  /**
   * Elevation primitive: returns a usable `su_token` (cached or freshly
   * verified). While the lock is held, it queues instead of opening a second
   * modal — this is the single-flight guarantee the frontend review demanded.
   */
  const acquireToken = useCallback((): Promise<string> => {
    const cached = tokenRef.current;
    if (cached && expiresAtRef.current > Date.now()) {
      return Promise.resolve(cached);
    }

    // Cached token is gone or stale — a fresh elevation is required.
    tokenRef.current = null;
    expiresAtRef.current = 0;

    if (flowActiveRef.current) {
      return new Promise<string>((resolve, reject) => {
        queueRef.current.push({ resolve, reject });
      });
    }

    const pending = startFlow();
    void fireStepUpRequest();
    return pending;
  }, [startFlow, fireStepUpRequest]);

  const sudoMutation = useCallback(
    async <T = any>(options: SudoMutationOptions): Promise<ApiResponse<T>> => {
      const run = async (): Promise<ApiResponse<T>> => {
        try {
          await getCsrfToken();
        } catch {
          /* csrf is best-effort; the header is sent only when known */
        }

        const headers: Record<string, string> = {
          ...csrfHeaders(),
          'Content-Type': 'application/json',
        };
        const cached =
          tokenRef.current && expiresAtRef.current > Date.now()
            ? tokenRef.current
            : null;
        if (cached) headers['x-sudo-token'] = cached;

        const res = await fetch(options.url, {
          method: options.method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });

        if (res.status !== 403) return parseResponse<T>(res);

        let body: any = null;
        try {
          body = await res.json();
        } catch {
          /* non-JSON body */
        }
        const code = body?.error?.code;
        if (code !== 'STEP_UP_REQUIRED' && code !== 'STEP_UP_EXPIRED') {
          return body as ApiErrorResponse;
        }

        // Elevate once (may queue behind an in-flight flow), then REPLAY the
        // exact original request with the fresh token.
        const freshToken = await acquireToken();
        headers['x-sudo-token'] = freshToken;
        const retry = await fetch(options.url, {
          method: options.method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
        return parseResponse<T>(retry);
      };

      try {
        return await run();
      } catch {
        return {
          success: false as const,
          error: { message: 'تم إلغاء عملية سودو مود' },
        };
      }
    },
    [acquireToken]
  );

  return (
    <SudoContext.Provider value={{ sudoMutation, isSudoFlowActive }}>
      {children}
      <StepUpModal
        open={modalOpen}
        phase={phase}
        maskedEmail={maskedEmail}
        error={error}
        expiresIn={expiresIn}
        resendUnlocksAt={resendUnlocksAt}
        onVerify={verifyCode}
        onResend={resendCode}
        onClose={cancelFlow}
      />
    </SudoContext.Provider>
  );
}