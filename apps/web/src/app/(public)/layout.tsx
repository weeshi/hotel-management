import Link from 'next/link';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[var(--gold)]">
            🏨 فندق السلام
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/rooms" className="text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors">
              الغرف
            </Link>
            <Link href="/auth/login" className="px-4 py-2 rounded-xl bg-[var(--gold)] text-black font-bold text-sm hover:brightness-110 transition-all">
              تسجيل الدخول
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-[var(--text-muted)]">
          <p>© {new Date().getFullYear()} فندق السلام — جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </div>
  );
}
