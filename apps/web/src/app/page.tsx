import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] p-8">
      <div className="text-center max-w-2xl">
        <div className="inline-block px-4 py-1.5 rounded-full border border-[var(--border-gold)] text-[var(--gold)] text-sm font-semibold mb-6 bg-[rgba(201,168,76,0.08)]">
          🏨 نظام إدارة الفنادق v2.0
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
          نظام <span className="text-[var(--gold)]">إدارة الفنادق</span>
        </h1>

        <p className="text-lg text-[var(--text-secondary)] mb-8 max-w-lg mx-auto">
          منصة متكاملة لإدارة الفنادق مع حجوزات، فوترة فندقية (Folio Billing)،
          بوابات دفع إلكترونية، و API للربط مع المنظومات العالمية
        </p>

        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/auth/login"
            className="px-6 py-3 rounded-xl bg-[var(--gold)] text-black font-bold hover:brightness-110 transition-all"
          >
            تسجيل الدخول
          </Link>
          <Link
            href="/auth/register"
            className="px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-all"
          >
            إنشاء حساب
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { icon: '📅', label: 'حجوزات ذكية' },
            { icon: '💳', label: 'فوترة فندقية' },
            { icon: '🔐', label: 'أمان متعدد الطبقات' },
            { icon: '🌐', label: 'API للشركاء' },
          ].map((item) => (
            <div key={item.label} className="card !p-4">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="text-sm text-[var(--text-secondary)]">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
