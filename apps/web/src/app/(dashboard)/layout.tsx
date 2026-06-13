'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const roleNavItems: Record<string, { section: string; items: { href: string; label: string }[] }[]> = {
  ADMIN: [
    { section: 'الرئيسية', items: [
      { href: '/admin', label: '⚙️ لوحة الإدارة' },
    ]},
    { section: 'الغرف', items: [
      { href: '/admin/rooms', label: '🚪 إدارة الغرف' },
    ]},
    { section: 'المستخدمين', items: [
      { href: '/admin/users', label: '👥 المستخدمين' },
    ]},
    { section: 'الإعدادات', items: [
      { href: '/admin/settings', label: '⚙️ إعدادات الفندق' },
    ]},
  ],
  MANAGER: [
    { section: 'الرئيسية', items: [
      { href: '/manager', label: '📊 التقارير' },
    ]},
  ],
  RECEPTION: [
    { section: 'الرئيسية', items: [
      { href: '/reception', label: '🏠 لوحة التحكم' },
    ]},
    { section: 'الحجوزات', items: [
      { href: '/reception/bookings', label: '📋 الحجوزات' },
      { href: '/reception/checkin', label: '🔑 تسجيل الدخول' },
    ]},
    { section: 'الغرف', items: [
      { href: '/reception/rooms', label: '🚪 الغرف' },
      { href: '/reception/calendar', label: '📅 التقويم' },
    ]},
    { section: 'الفوترة', items: [
      { href: '/reception/folio', label: '💰 الفواتير' },
      { href: '/reception/payments', label: '💳 المدفوعات' },
    ]},
  ],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/auth/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-[var(--text-muted)]">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 right-0 h-full w-[260px] bg-[var(--bg-secondary)] border-l border-[var(--border)] z-50 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-[var(--border)] text-center">
          <div className="text-2xl mb-1">🏨</div>
          <h2 className="text-sm font-bold text-[var(--gold)]">Hotel Management</h2>
        </div>

        <nav className="p-3 overflow-y-auto h-[calc(100%-80px)]">
          {(roleNavItems[user.role] || roleNavItems.RECEPTION).map((group) => (
            <div key={group.section} className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold px-3 py-2">
                {group.section}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    pathname === item.href
                      ? 'bg-[rgba(201,168,76,0.1)] text-[var(--gold)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:mr-[260px] min-h-screen">
        {/* Top bar */}
        <header className="h-14 border-b border-[var(--border)] flex items-center justify-between px-4 lg:px-6 bg-[var(--bg-secondary)]">
          <button
            className="lg:hidden text-xl text-[var(--text-secondary)]"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="text-sm text-[var(--text-secondary)]">
            مرحباً، <span className="text-[var(--text-primary)] font-semibold">{user.name}</span>
          </div>

          <button
            onClick={() => {
              localStorage.clear();
              router.push('/auth/login');
            }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"
          >
            🚪 تسجيل خروج
          </button>
        </header>

        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
