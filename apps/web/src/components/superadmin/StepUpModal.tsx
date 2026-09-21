'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useOtpInput } from '@/hooks/use-otp-input';

/**
 * SA.7 — Step-up (Sudo Mode) OTP modal (docs/SUPER-ADMIN-ARCH.md §SA.6).
 *
 * Reusable elevated-permission gate. Rendered by <SudoProvider> when a sudo
 * gated mutation (POST/DELETE /api/superadmin/integrations) is denied with
 * `403 STEP_UP_REQUIRED`. Reuses the same 6-box OTP controller as the login
 * screen (`useOtpInput`) so the UX is identical to what the Admin already
 * knows — numeric filtering, auto-advance, paste, auto-submit on fill, shake
 * on a wrong code. The step-up POST/verify network calls live in the provider;
 * this component is deliberately dumb: it renders state and reports events.
 */
export type StepUpPhase = 'sending' | 'ready' | 'verifying';

export interface StepUpModalProps {
  open: boolean;
  phase: StepUpPhase;
  maskedEmail: string;
  error: string | null;
  expiresIn: number;
  resendUnlocksAt: number;
  onVerify: (code: string) => Promise<boolean>;
  onResend: () => Promise<void>;
  onClose: () => void;
}

export function StepUpModal({
  open,
  phase,
  maskedEmail,
  error,
  expiresIn,
  resendUnlocksAt,
  onVerify,
  onResend,
  onClose,
}: StepUpModalProps) {
  const codeLock = useRef(false);
  const [shake, setShake] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);

  // 1s heartbeat drives the countdown/expiry display without input churn.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const resendCooldown = useMemo(
    () => Math.max(Math.ceil((resendUnlocksAt - now) / 1000), 0),
    [resendUnlocksAt, now]
  );

  // Runs on the 6th digit (useOtpInput.onComplete) or the confirm button.
  async function submitCode(code: string) {
    if (codeLock.current) return;
    codeLock.current = true;
    const ok = await onVerify(code);
    codeLock.current = false;
    if (!ok) {
      setShake((n) => n + 1);
      reset();
    }
  }

  const { values, setValueAt, onKeyDown, onPaste, registerRef, reset } = useOtpInput({
    length: 6,
    onComplete: submitCode,
  });

  async function handleResend() {
    setResending(true);
    reset();
    await onResend();
    setResending(false);
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Modal open={open} onClose={onClose} title="تأكيد إضافي (Sudo Mode)" size="sm">
      <div data-testid="stepup-modal" className="pt-1">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-1">
          هذا الإجراء حساس ويتطلب إعادة تحقق إضافية. أدخل الرمز المكوّن من 6 أرقام
          المرسل إلى
        </p>
        <p dir="ltr" className="mb-4 text-center text-sm font-semibold text-[var(--gold)]">
          {maskedEmail}
        </p>

        {phase === 'sending' ? (
          <p className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-center text-sm text-[var(--text-muted)] py-8">
            جارٍ إرسال رمز التحقق…
          </p>
        ) : (
          <>
            <div
              key={shake}
              className={shake > 0 ? 'otp-shake' : ''}
              role="group"
              aria-label="رمز التحقق"
            >
              <div dir="ltr" className="flex justify-center gap-2">
                {values.map((value, i) => (
                  <input
                    key={i}
                    ref={registerRef(i)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={value}
                    onChange={(e) => setValueAt(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    onPaste={onPaste}
                    aria-label={`الرقم ${i + 1}`}
                    data-testid={`otp-input-${i}`}
                    className="otp-input"
                  />
                ))}
              </div>
            </div>

            {error && (
              <p
                role="alert"
                data-testid="otp-error"
                className="mt-4 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-4 py-2.5 text-center text-sm text-[var(--red)] otp-fade-in"
              >
                {error}
              </p>
            )}

            <div className="mt-6 space-y-3">
              <Button
                type="button"
                onClick={() => submitCode(values.join(''))}
                loading={phase === 'verifying' || resending}
                disabled={values.some((v) => !v)}
                className="w-full"
                size="lg"
              >
                {phase === 'verifying' ? 'جاري التحقق…' : 'تأكيد الرمز'}
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                <span>لم يصلك الرمز؟</span>
                <button
                  type="button"
                  data-testid="otp-resend-btn"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resending}
                  className="font-semibold text-[var(--gold)] hover:underline disabled:pointer-events-none disabled:text-[var(--text-muted)]"
                >
                  {resending
                    ? 'جارٍ الإرسال…'
                    : resendCooldown > 0
                      ? `إعادة الإرسال بعد ${resendCooldown} ث`
                      : 'إعادة إرسال الرمز'}
                </button>
              </div>

              <p className="text-center text-xs text-[var(--text-muted)]">
                ينتهي الرمز خلال {fmt(expiresIn)}
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}