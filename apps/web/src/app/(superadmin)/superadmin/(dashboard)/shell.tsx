'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from './sign-out-button';

const NAV_GROUPS: { section: string; items: { href: string; label: string }[] }[] = [
  {
    section: 'إدارة المنصة',
    items: [
      { href: '/superadmin', label: '🏠 نظرة عامة' },
      { href: '/superadmin/hotels', label: '🏨 الفنادق' },
      { href: '/superadmin/invitations', label: '📨 الدعوات' },
      { href: '/admin/queues', label: '⚙️ مراقبة الطوابير' },
    ],
  },
];

export function DashboardShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div data-component="SuperAdminDashboardShell" className="flex min-h-screen">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] p-4 sticky top-0 h-screen">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="text-2xl">👑</span>
          <div>
            <div className="font-bold leading-tight">لوحة التحكم العليا</div>
            <div className="text-xs text-[var(--text-muted)]">Super Admin</div>
          </div>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.section} className="mb-6">
            <p className="mb-2 px-2 text-xs font-semibold text-[var(--text-muted)]">
              {group.section}
            </p>
            <nav className="space-y-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-all ${
                      active
                        ? 'bg-[rgba(201,168,76,0.12)] font-semibold text-[var(--gold)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="mt-auto border-t border-[var(--border)] pt-4">
          <div className="mb-3 px-2">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-[var(--text-muted)]" dir="ltr">
              {user.email}
            </div>
          </div>
          <SignOutButton fullWidth />
        </div>
      </aside>

      <div className="flex-1">
        <header className="lg:hidden flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <span className="font-bold">لوحة التحكم العليا</span>
          </div>
          <SignOutButton />
        </header>

        <main className="p-6 lg:p-8 max-w-7xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}