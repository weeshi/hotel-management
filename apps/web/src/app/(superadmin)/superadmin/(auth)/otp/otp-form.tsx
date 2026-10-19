'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { Button } from '@/components/ui/button';
import { useOtpInput } from '@/hooks/use-otp-input';

interface OtpFormProps {
  maskedEmail: string;
  expiresInSeconds: number;
  resendUnlocksAt: number;
}

// Terminal failures — the challenge is gone, do not let the user keep typing.
const TERMINAL_CODES = new Set([
  'CHALLENGE_MISSING',
  'CHALLENGE_INVALID',
  'EXPIRED',
  'EXHAUSTED',
  'CONSUMED',
  'INVALID_CHALLENGE',
]);

export function OtpForm({ maskedEmail, expiresInSeconds, resendUnlocksAt }: OtpFormProps) {
  const router = useRouter();
  const codeLock = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const [expiresIn, setExpiresIn] = useState(() =>
    Math.max(expiresInSeconds, 0)
  );
  const [resendAt, setResendAt] = useState(() => Math.max(resendUnlocksAt, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);

  // 1s heartbeat drives the countdowns without re-render churn from inputs.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Expiry without interaction -> the challenge is dead; bounce to login.
  useEffect(() => {
    if (expiresIn <= 0 && !verifying) {
      router.replace('/superadmin/login');
    }
  }, [expiresIn, verifying, router]);

  const resendCooldown = useMemo(
    () => Math.max(Math.ceil((resendAt - now) / 1000), 0),
    [resendAt, now]
  );

  const showErrorOnce = useCallback(
    (message: string) => {
      setVerifying(false);
      setError(message);
      setShake((n) => n + 1);
    },
    []
  );

  async function submitCode(code: string) {
    if (codeLock.current) return;
    codeLock.current = true;
    setError(null);
    setVerifying(true);

    try {
      await getCsrfToken();
      const res = await fetch('/api/superadmin/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();

      // Succesful redemption: cookies carry the real session — go to the shell.
      if (json.success) {
        router.replace('/superadmin');
        return;
      }

      const message = json.error?.message ?? 'رمز غير صحيح';
      if (TERMINAL_CODES.has(json.error?.code)) {
        showErrorOnce(message);
        setTimeout(() => router.replace('/superadmin/login'), 1400);
      } else {
        // Wrong code -> shake + clear so the user retypes clean.
        showErrorOnce(message);
      }
    } catch {
      showErrorOnce('حدث خطأ في الاتصال');
    } finally {
      setVerifying(false);
      codeLock.current = false;
    }
  }

  const { values, setValueAt, onKeyDown, onPaste, registerRef, reset } = useOtpInput({
    length: 6,
    onComplete: submitCode,
  });

  async function resendCode() {
    setResending(true);
    setError(null);
    try {
      await getCsrfToken();
      const res = await fetch('/api/superadmin/auth/resend-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: '{}',
      });
      const json = await res.json();

      if (json.success) {
        const retry = Number(json.data?.retryAfterSeconds ?? 60);
        setResendAt(Date.now() + retry * 1000);
        setExpiresIn(Number(json.data?.expiresIn ?? expiresIn));
        reset();
        return;
      }

      if (TERMINAL_CODES.has(json.error?.code)) {
        showErrorOnce(json.error.message);
        setTimeout(() => router.replace('/superadmin/login'), 1400);
      } else {
        // COOLDOWN: the backend gave us Retry-After (seconds) -> honour it.
        const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
        if (retryAfter > 0) setResendAt(Date.now() + retryAfter * 1000);
        showErrorOnce(json.error?.message ?? 'تعذّر إعادة الإرسال');
      }
    } catch {
      showErrorOnce('حدث خطأ في الاتصال');
    } finally {
      setResending(false);
    }
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="card w-full !p-8">
      <div className="text-center mb-8">
        <div className="text-4xl mb-2">🔐</div>
        <h1 className="text-2xl font-bold">خطوة التحقق</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          أدخل الرمز المكوّن من 6 أرقام المرسل إلى
        </p>
        <p dir="ltr" className="mt-1 text-sm font-semibold text-[var(--gold)]">
          {maskedEmail}
        </p>
      </div>

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
          loading={verifying}
          disabled={values.some((v) => !v)}
          className="w-full"
          size="lg"
        >
          {verifying ? 'جاري التحقق...' : 'تأكيد الرمز'}
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
          <span>لم يصلك الرمز؟</span>
          <button
            type="button"
            data-testid="otp-resend-btn"
            onClick={resendCode}
            disabled={resendCooldown > 0 || resending}
            className="font-semibold text-[var(--gold)] hover:underline disabled:pointer-events-none disabled:text-[var(--text-muted)]"
          >
            {resending
              ? 'جارٍ الإرسال...'
              : resendCooldown > 0
                ? `إعادة الإرسال بعد ${resendCooldown} ث`
                : 'إعادة إرسال الرمز'}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        ينتهي الرمز خلال {fmt(expiresIn)}
      </p>
    </div>
  );
}