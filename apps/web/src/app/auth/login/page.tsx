'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { showErrorModal } from '@/components/ui/error-modal';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/context')
      .then(async (res) => {
        const data = await res.json();
        if (data.success && data.data?.hotelName) {
          setTenantName(data.data.hotelName);
        }
      })
      .catch(() => {
        /* generic SaaS branding is shown when the context is unavailable */
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!data.success) {
        showErrorModal(data.error?.message || 'فشل تسجيل الدخول');
        return;
      }

      localStorage.setItem('accessToken', data.data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));

      const role = data.data.user?.role;
      if (role === 'SUPER_ADMIN') {
        router.push('/superadmin');
      } else {
        router.push('/reception');
      }
    } catch {
      showErrorModal('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="card w-full max-w-md !p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏨</div>
          <h1 className="text-2xl font-bold">{tenantName || 'تسجيل الدخول'}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {tenantName ? `نظام إدارة ${tenantName}` : 'نظام إدارة الفنادق'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors"
              placeholder="admin@hotel.com"
              required
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
