'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Modal, Badge, EmptyState, Table } from '@/components/ui';
import { apiGet, apiPost } from '@/lib/utils/api-client';
import { addToast } from '@/lib/utils/toast';

interface InvitationRow {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: 'PENDING' | 'EXPIRED' | 'USED';
  isUsed: boolean;
  usedAt?: string | null;
  expiresAt: string;
  createdAt: string;
  hotel: { id: string; name: string; customDomain?: string | null };
  createdBy?: { id: string; name?: string; email: string } | null;
}

interface ResendResult {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitationLink: string;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'مشرف النظام',
  ADMIN: 'مدير النظام',
  MANAGER: 'مدير',
  RECEPTION: 'استقبال',
  HOUSEKEEPING: 'تدبير منزلي',
  MAINTENANCE: 'صيانة',
  RESTAURANT: 'مطعم',
  ACCOUNTANT: 'محاسب',
};

const statusBadge: Record<InvitationRow['status'], { label: string; variant: 'green' | 'yellow' | 'red' }> = {
  PENDING: { label: 'معلقة', variant: 'yellow' },
  EXPIRED: { label: 'منتهية الصلاحية', variant: 'red' },
  USED: { label: 'مستخدمة', variant: 'green' },
};

export default function SuperAdminInvitationsPage() {
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<ResendResult | null>(null);

  async function fetchInvitations() {
    setLoading(true);
    const res = await apiGet<InvitationRow[]>('/api/superadmin/invitations');
    if (res.success) setInvitations(res.data);
    else addToast('error', res.error?.message || 'فشل تحميل الدعوات');
    setLoading(false);
  }

  useEffect(() => { fetchInvitations(); }, []);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      addToast('success', '✅ تم نسخ الرابط');
    } catch {
      addToast('error', 'تعذر نسخ الرابط');
    }
  }

  async function resendInvitation(invitation: InvitationRow) {
    setResendingId(invitation.id);
    const res = await apiPost<ResendResult>(`/api/superadmin/invitations/${invitation.id}/resend`);
    setResendingId(null);

    if (!res.success) {
      addToast('error', res.error?.message || 'فشل إعادة إرسال الدعوة');
      return;
    }

    addToast('success', '✅ تم تجديد الرابط وإعادة إرسال الدعوة');
    setResendResult(res.data);
    fetchInvitations();
  }

  const columns = [
    {
      key: 'hotel',
      header: 'الفندق',
      render: (i: InvitationRow) => (
        <div>
          <div className="font-semibold text-[var(--text-primary)]">{i.hotel.name}</div>
          {i.hotel.customDomain && (
            <div className="text-xs text-[var(--text-muted)]" dir="ltr">{i.hotel.customDomain}</div>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'البريد',
      render: (i: InvitationRow) => (
        <div>
          <div dir="ltr" className="text-left">{i.email}</div>
          {i.name && <div className="text-xs text-[var(--text-muted)]">{i.name}</div>}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'الدور',
      render: (i: InvitationRow) => <span>{roleLabels[i.role] || i.role}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (i: InvitationRow) => {
        const s = statusBadge[i.status];
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'createdAt',
      header: 'تاريخ الإرسال',
      render: (i: InvitationRow) => (
        <span className="text-xs text-[var(--text-muted)]">
          {new Date(i.createdAt).toLocaleDateString('ar-LY')}
        </span>
      ),
    },
    {
      key: 'expiresAt',
      header: 'الانتهاء',
      render: (i: InvitationRow) => (
        <span className="text-xs text-[var(--text-muted)]">
          {new Date(i.expiresAt).toLocaleDateString('ar-LY')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'إجراءات',
      render: (i: InvitationRow) => {
        if (i.isUsed) return <span className="text-xs text-[var(--text-muted)]">—</span>;
        return (
          <Button
            size="sm"
            variant="secondary"
            loading={resendingId === i.id}
            onClick={() => resendInvitation(i)}
          >
            📨 إعادة إرسال
          </Button>
        );
      },
    },
  ];

  const summary = {
    total: invitations.length,
    pending: invitations.filter((i) => i.status === 'PENDING').length,
    expired: invitations.filter((i) => i.status === 'EXPIRED').length,
    used: invitations.filter((i) => i.status === 'USED').length,
  };

  return (
    <div data-component="SuperAdminInvitationsPage">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">📨 دعوات الانضمام</h2>
        <Button variant="secondary" onClick={() => fetchInvitations()}>🔄 تحديث</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <div className="text-2xl font-bold">{summary.total}</div>
          <div className="text-xs text-[var(--text-muted)]">إجمالي الدعوات</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-[var(--yellow)]">{summary.pending}</div>
          <div className="text-xs text-[var(--text-muted)]">معلقة</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-[var(--red)]">{summary.expired}</div>
          <div className="text-xs text-[var(--text-muted)]">منتهية الصلاحية</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-[var(--green)]">{summary.used}</div>
          <div className="text-xs text-[var(--text-muted)]">مستخدمة</div>
        </Card>
      </div>

      {invitations.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon="📨"
            title="لا توجد دعوات بعد"
            description="أنشئ فندقًا جديدًا من تبويب الفنادق لإصدار دعوة المدير"
          />
        </Card>
      ) : (
        <Table
          columns={columns}
          data={invitations}
          keyExtractor={(i) => i.id}
          loading={loading}
          emptyMessage="لا توجد دعوات"
        />
      )}

      {/* Resend result modal */}
      <Modal
        open={!!resendResult}
        onClose={() => setResendResult(null)}
        title="📨 رابط دعوة جديد"
      >
        {resendResult && (
          <div className="space-y-4">
            <div className="bg-[rgba(52,152,219,0.08)] border border-[var(--blue)]/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold" dir="ltr">{resendResult.email}</span>
                <Badge variant="blue">7 أيام</Badge>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                تم إلغاء الرابط القديم — الرابط الجديد أدناه هو الصالح الوحيد.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                readOnly
                value={resendResult.invitationLink}
                className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] focus:outline-none"
                dir="ltr"
              />
              <Button size="sm" onClick={() => copyToClipboard(resendResult.invitationLink)}>
                📋 نسخ
              </Button>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => { setResendResult(null); window.open(resendResult.invitationLink, '_blank'); }}
              >
                فتح الرابط
              </Button>
              <Button type="button" onClick={() => setResendResult(null)}>تم</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
