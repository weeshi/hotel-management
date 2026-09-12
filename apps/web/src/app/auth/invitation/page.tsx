'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { showErrorModal } from '@/components/ui/error-modal';

type InviteState =
  | { status: 'loading' }
  | { status: 'valid'; email: string; name?: string; hotelName: string }
  | { status: 'error'; message: string };

function InvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<InviteState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'رمز الدعوة مطلوب' });
      return;
    }
    fetch(`/api/auth/invitations/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!data.success) {
          setState({ status: 'error', message: data.error?.message || 'رمز الدعوة غير صالح' });
          return;
        }
        setState({ status: 'valid', email: data.data.email, name: data.data.name, hotelName: data.data.hotelName });
        if (data.data.name) setName(data.data.name);
      })
      .catch(() => setState({ status: 'error', message: 'حدث خطأ في الاتصال' }));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      showErrorModal('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (password !== confirm) {
      showErrorModal('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password, phone }),
      });
      const data = await res.json();
      if (!data.success) {
        showErrorModal(data.error?.message || 'فشل إنشاء الحساب');
        return;
      }
      router.push('/auth/login?invited=1');
    } catch {
      showErrorModal('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
        <p className="text-[var(--text-secondary)]">جاري التحقق من الدعوة...</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
        <div className="card w-full max-w-md !p-8 text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-xl font-bold mb-2">رابط الدعوة غير صالح</h1>
          <p className="text-sm text-[var(--text-secondary)]">{state.message}</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="mt-6 w-full py-2.5 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 transition-all"
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="card w-full max-w-md !p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏨</div>
          <h1 className="text-2xl font-bold">تفعيل حسابك</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            تمت دعوتك للانضمام إلى <span className="font-bold text-[var(--text-primary)]">{state.hotelName}</span>
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1" dir="ltr">
            {state.email}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
              الاسم الكامل
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors"
              placeholder="محمد أحمد"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
              رقم الهاتف <span className="text-[var(--text-muted)]">(اختياري)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors"
              placeholder="+218 91 234 5678"
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
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
              تأكيد كلمة المرور
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'جاري التفعيل...' : 'تفعيل الحساب'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function InvitationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4"><p className="text-[var(--text-secondary)]">جاري التحميل...</p></div>}>
      <InvitationContent />
    </Suspense>
  );
}
