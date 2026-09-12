'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const tabs = [
  { href: '/superadmin/hotels', label: '🏨 الفنادق' },
  { href: '/superadmin/invitations', label: '📨 الدعوات' },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/auth/login');
      return;
    }
    try {
      const user = JSON.parse(stored);
      // Strict 1:1 platform — only SUPER_ADMIN may reach these routes. The
      // edge middleware enforces the same rule; this is the client-side guard.
      if (user.role !== 'SUPER_ADMIN') {
        router.push('/access-denied');
        return;
      }
      setChecked(true);
    } catch {
      router.push('/auth/login');
    }
  }, [router]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
        جاري التحقق من الصلاحيات...
      </div>
    );
  }

  return (
    <div data-component="SuperAdminLayout">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">👑 لوحة التحكم العليا</h1>
        <p className="text-sm text-[var(--text-muted)]">إدارة فنادق المنصة ودعوات الانضمام (SaaS)</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-3">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? 'bg-[rgba(201,168,76,0.12)] text-[var(--gold)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
