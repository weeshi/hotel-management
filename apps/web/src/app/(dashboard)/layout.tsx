'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ToastContainer } from '@/components/ui/toast';
import { ErrorModal } from '@/components/ui/error-modal';
import { apiGet } from '@/lib/utils/api-client';
import { AuthProvider } from '@/contexts/auth-context';

const roleNavItems: Record<string, { section: string; items: { href: string; label: string }[] }[]> = {
  SUPER_ADMIN: [
    { section: '👑 منصة SaaS', items: [
      { href: '/superadmin/hotels', label: '🏨 الفنادق' },
      { href: '/superadmin/invitations', label: '📨 الدعوات' },
    ]},
    { section: '⚙️ مراقبة الطوابير', items: [
      { href: '/superadmin/jobs', label: '📋 لوحة الطوابير (Bull Board)' },
    ]},
  ],
  ADMIN: [
    { section: '🔝 تشغيل يومي', items: [
      { href: '/admin', label: '⚙️ لوحة الإدارة' },
      { href: '/reception/bookings', label: '📋 الحجوزات' },
      { href: '/reception/bookings/new', label: '🆕 حجز جديد' },
      { href: '/reception/checkin', label: '🔑 تسجيل الدخول / الخروج' },
      { href: '/admin/guests', label: '👤 النزلاء' },
      { href: '/reception/folio', label: '💰 الفواتير' },
      { href: '/reception/payments', label: '💳 المدفوعات' },
      { href: '/reception/tape-chart', label: '📊 المخطط الزمني' },
      { href: '/reception/group-bookings', label: '👥 الحجوزات الجماعية' },
    ]},
    { section: '🏗️ إدارة المنشأة', items: [
      { href: '/admin/rooms', label: '🚪 إدارة الغرف' },
      { href: '/admin/room-types', label: '🏗️ فئات الغرف' },
      { href: '/admin/services', label: '🛎️ الخدمات' },
      { href: '/admin/restaurant', label: '🍽️ المطعم' },
    ]},
    { section: '🧹 التدبير المنزلي', items: [
      { href: '/admin/housekeeping', label: '🧹 مهام التنظيف' },
      { href: '/admin/maintenance', label: '🔧 مهام الصيانة' },
      { href: '/admin/task-types', label: '📋 أنواع المهام' },
    ]},
    { section: '➕ خدمات إضافية', items: [
      { href: '/admin/safeboxes', label: '🔐 صناديق الأمانات' },
      { href: '/admin/lost-found', label: '📦 المفقودات' },
    ]},
    { section: '🏷️ الأسعار', items: [
      { href: '/admin/rate-plans', label: '🏷️ خطط الأسعار' },
      { href: '/admin/cancellation-policies', label: '❌ سياسات الإلغاء' },
    ]},
    { section: '👥 المستخدمين', items: [
      { href: '/admin/users', label: '👥 المستخدمين' },
    ]},
    { section: '📊 إدارة عليا', items: [
      { href: '/admin/wallet', label: '💰 إدارة المحافظ' },
      { href: '/admin/reports', label: '📊 التقارير' },
      { href: '/admin/audit-logs', label: '📋 سجل التدقيق' },
      { href: '/admin/notifications', label: '🔔 الإشعارات' },
      { href: '/admin/integrations', label: '🔌 تكاملات الحجز' },
      { href: '/admin/channel-manager', label: '📡 مدير القنوات (OTA)' },
      { href: '/admin/api-keys', label: '🔑 مفاتيح API' },
      { href: '/admin/website-settings', label: '🌐 إعدادات الموقع' },
      { href: '/admin/settings', label: '⚙️ إعدادات الفندق' },
    ]},
  ],
  MANAGER: [
    { section: '📊 التقارير', items: [
      { href: '/manager', label: '📊 التقارير' },
      { href: '/admin/reports', label: '📈 التقارير المتقدمة' },
    ]},
    { section: '👤 النزلاء', items: [
      { href: '/admin/guests', label: '👤 النزلاء' },
    ]},
    { section: '➕ خدمات إضافية', items: [
      { href: '/admin/safeboxes', label: '🔐 صناديق الأمانات' },
      { href: '/admin/lost-found', label: '📦 المفقودات' },
    ]},
    { section: '🔔 النظام', items: [
      { href: '/admin/audit-logs', label: '📋 سجل التدقيق' },
      { href: '/admin/notifications', label: '🔔 الإشعارات' },
      { href: '/admin/api-keys', label: '🔑 مفاتيح API' },
    ]},
  ],
  RECEPTION: [
    { section: '🔝 تشغيل يومي', items: [
      { href: '/reception', label: '🏠 لوحة التحكم' },
      { href: '/reception/bookings', label: '📋 الحجوزات' },
      { href: '/reception/bookings/new', label: '🆕 حجز جديد' },
      { href: '/reception/checkin', label: '🔑 تسجيل الدخول / الخروج' },
      { href: '/reception/folio', label: '💰 الفواتير' },
      { href: '/reception/payments', label: '💳 المدفوعات' },
      { href: '/reception/guests', label: '👤 النزلاء' },
      { href: '/reception/group-bookings', label: '👥 الحجوزات الجماعية' },
    ]},
    { section: '🚪 الغرف', items: [
      { href: '/reception/rooms', label: '🚪 الغرف' },
      { href: '/reception/calendar', label: '📅 التقويم' },
      { href: '/reception/tape-chart', label: '📊 المخطط الزمني' },
    ]},
    { section: '🧹 التدبير المنزلي', items: [
      { href: '/reception/housekeeping', label: '🧹 مهام التنظيف' },
      { href: '/reception/maintenance', label: '🔧 مهام الصيانة' },
    ]},
    { section: '🍽️ المطعم', items: [
      { href: '/reception/pos', label: '🍽️ المطعم (نقاط البيع)' },
    ]},
    { section: '➕ خدمات إضافية', items: [
      { href: '/admin/safeboxes', label: '🔐 صناديق الأمانات' },
      { href: '/reception/lost-found', label: '📦 المفقودات' },
    ]},
    { section: '🔔 النظام', items: [
      { href: '/reception/notifications', label: '🔔 الإشعارات' },
    ]},
  ],
  HOUSEKEEPING: [
    { section: '🧹 مهامي', items: [
      { href: '/housekeeping', label: '🧹 مهام التنظيف' },
    ]},
    { section: '🔔 النظام', items: [
      { href: '/reception/notifications', label: '🔔 الإشعارات' },
    ]},
  ],
  MAINTENANCE: [
    { section: '🔧 مهامي', items: [
      { href: '/maintenance', label: '🔧 مهام الصيانة' },
    ]},
    { section: '🔔 النظام', items: [
      { href: '/reception/notifications', label: '🔔 الإشعارات' },
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifDropdown, setNotifDropdown] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const fetchUnread = useCallback(async () => {
    try {
      const res = await apiGet('/api/admin/notifications?status=PENDING&limit=5');
      if (res.success) {
        setUnreadCount(res.pagination?.total || res.data?.length || 0);
        setRecentNotifs(res.data?.slice(0, 5) || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/auth/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  useEffect(() => {
    if (user) {
      fetchUnread();
      const interval = setInterval(fetchUnread, 30000);
      return () => clearInterval(interval);
    }
  }, [user, fetchUnread]);

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

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setNotifDropdown(!notifDropdown)}
                className="relative text-xl text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--red)] text-white text-[10px] flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifDropdown(false)} />
                  <div className="absolute left-0 top-full mt-2 w-80 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-xl z-50">
                    <div className="p-3 border-b border-[var(--border)]">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">الإشعارات</span>
                        <Link href={user.role === 'ADMIN' ? '/admin/notifications' : '/reception/notifications'} className="text-xs text-[var(--gold)]" onClick={() => setNotifDropdown(false)}>عرض الكل</Link>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {recentNotifs.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[var(--text-muted)]">لا توجد إشعارات جديدة</div>
                      ) : recentNotifs.map((n: any) => (
                        <div key={n.id} className="p-3 border-b border-[var(--border)] hover:bg-[var(--bg-card)] text-sm">
                          <div className="font-semibold text-[var(--text-primary)]">{n.subject || n.type}</div>
                          {n.body && <div className="text-xs text-[var(--text-secondary)] mt-0.5">{n.body}</div>}
                          <div className="text-[10px] text-[var(--text-muted)] mt-1">{new Date(n.createdAt).toLocaleString('ar-LY')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

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
          </div>
        </header>

        <div className="p-4 lg:p-6"><AuthProvider>{children}</AuthProvider></div>
      </main>
      <ToastContainer />
      <ErrorModal />
    </div>
  );
}
