'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginSchema } from '@hotel/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LoginResponse {
  success: boolean;
  data?: { otpRequired: boolean; email: string; expiresIn: number };
  error?: { message: string; code?: string };
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError(parsed.error.errors.map((err) => err.message).join('، '));
      return;
    }
    setFieldError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/superadmin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json: LoginResponse = await res.json();

      if (!json.success) {
        setServerError(json.error?.message || 'فشل تسجيل الدخول');
        return;
      }

      // First factor OK — `sa_otp` challenge cookie is now set (HttpOnly).
      router.replace('/superadmin/otp');
    } catch {
      setServerError('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card w-full !p-8">
      <div className="text-center mb-8">
        <div className="text-4xl mb-2">🛡️</div>
        <h1 className="text-2xl font-bold">لوحة التحكم العليا</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          تسجيل الدخول بحساب مالك المنصة
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          id="email"
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          placeholder="owner@platform.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          id="password"
          label="كلمة المرور"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {fieldError && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-4 py-3 text-sm text-[var(--red)]"
          >
            {fieldError}
          </div>
        )}
        {serverError && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-4 py-3 text-sm text-[var(--red)]"
          >
            {serverError}
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          {loading ? 'جاري التحقق...' : 'متابعة'}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        يتم إرسال رمز تحقق إلى بريدك الإلكتروني بعد التحقق من كلمة المرور
      </p>
    </div>
  );
}