'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import {
  GuestProfileHeader,
  GuestBookingHistory,
  GuestWalletCard,
  GuestFolioList,
  EditGuestModal,
  WalletTransactionModal,
} from '@/components/guests';
import { apiGet } from '@/lib/utils/api-client';
import { GuestDocuments } from '@/components/guest/GuestDocuments';

interface SafeBoxItem {
  id: string;
  serialNumber: number;
  status: string;
  openedAt: string;
  rentalFee: number | null;
  rentalDuration: string | null;
  expectedEndDate: string | null;
  package: { name: string } | null;
  items: { id: string; description: string }[];
  room: { roomNumber: string } | null;
}

interface GuestDetail {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  nationality?: string | null;
  idNumber?: string | null;
  loyaltyPoints: number;
  notes?: string | null;
  createdAt: string;
  wallet?: { id: string; balance: number; transactions: any[] } | null;
  _count?: { bookings: number };
  bookings: any[];
  idDocumentUrl?: string | null;
}

const DURATION_LABELS: Record<string, string> = {
  DAILY: 'يومي',
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
};

export default function ReceptionGuestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [guest, setGuest] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [showEdit, setShowEdit] = useState(false);
  const [walletModal, setWalletModal] = useState<{ open: boolean; type: 'DEPOSIT' | 'WITHDRAWAL' }>({ open: false, type: 'DEPOSIT' });

  async function fetchGuest() {
    try {
      const res = await apiGet(`/api/admin/guests/${params.id}`);
      if (res.success) setGuest(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchGuest(); }, [params.id]);

  // --- Derive all safe boxes across all bookings ---
  const safeBoxes: SafeBoxItem[] = (guest?.bookings || []).flatMap(
    (b: any) => b.safeDepositBoxes || []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!guest) {
    return <div className="text-center py-12 text-[var(--text-muted)]">النزيل غير موجود</div>;
  }

  const tabs = [
    { key: 'info', label: 'ℹ️ المعلومات' },
    { key: 'documents', label: '🛂 الوثائق' },
    { key: 'bookings', label: '📋 الحجوزات' },
    { key: 'wallet', label: '💰 المحفظة' },
    { key: 'folios', label: '🧾 الفواتير' },
    { key: 'safeboxes', label: `🔐 الصناديق (${safeBoxes.length})` },
  ];

  return (
    <div data-component="ReceptionGuestDetailPage">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg">&larr;</button>
        <h1 className="text-2xl font-bold">👤 {guest.name}</h1>
      </div>

      <GuestProfileHeader guest={guest} onEdit={() => setShowEdit(true)} />

      <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-2 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key
                ? 'bg-[var(--gold)] text-black'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">العنوان</h3>
            <p className="text-sm">{guest.address || '—'}</p>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">رقم الهوية</h3>
            <p className="text-sm">{guest.idNumber || '—'}</p>
          </div>
        </div>
      )}

      {tab === 'bookings' && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
          <GuestBookingHistory bookings={guest.bookings || []} />
        </div>
      )}

      {tab === 'documents' && (
        <GuestDocuments guestId={guest.id} />
      )}

      {tab === 'wallet' && (
        <GuestWalletCard
          wallet={guest.wallet}
          canManage={true}
          onDeposit={() => setWalletModal({ open: true, type: 'DEPOSIT' })}
          onWithdraw={() => setWalletModal({ open: true, type: 'WITHDRAWAL' })}
          onRefresh={fetchGuest}
        />
      )}

      {tab === 'folios' && (
        <GuestFolioList
          folios={(guest.bookings || [])
            .filter((b: any) => b.folio)
            .map((b: any) => ({
              bookingId: b.id,
              bookingNo: b.bookingNo,
              checkIn: b.checkIn,
              checkOut: b.checkOut,
              status: b.status,
              folio: b.folio,
            }))}
          basePath="/reception/guests"
          onViewFolio={(entry) => router.push(`/reception/folio?bookingId=${entry.bookingId}`)}
        />
      )}

      {tab === 'safeboxes' && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
          {safeBoxes.length === 0 ? (
            <p className="p-6 text-sm text-[var(--text-muted)] text-center">لا توجد صناديق أمانات لهذا النزيل</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="text-right p-3 font-medium">#</th>
                  <th className="text-right p-3 font-medium">الحالة</th>
                  <th className="text-right p-3 font-medium">الباقة</th>
                  <th className="text-right p-3 font-medium">المدة</th>
                  <th className="text-right p-3 font-medium">الرسوم</th>
                  <th className="text-right p-3 font-medium">تاريخ الفتح</th>
                  <th className="text-right p-3 font-medium">ينتهي في</th>
                  <th className="text-right p-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {safeBoxes.map((box) => (
                  <tr key={box.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="p-3 font-bold">{box.serialNumber}</td>
                    <td className="p-3">
                      <Badge variant={box.status === 'ACTIVE' ? 'gold' : 'green'}>
                        {box.status === 'ACTIVE' ? 'نشط' : 'مغلق'}
                      </Badge>
                    </td>
                    <td className="p-3">{box.package?.name || '—'}</td>
                    <td className="p-3">{box.rentalDuration ? DURATION_LABELS[box.rentalDuration] || box.rentalDuration : '—'}</td>
                    <td className="p-3">{box.rentalFee != null ? `${Number(box.rentalFee).toLocaleString()} د.ل` : '—'}</td>
                    <td className="p-3 text-[var(--text-muted)]">{new Date(box.openedAt).toLocaleDateString('ar-LY')}</td>
                    <td className="p-3 text-[var(--text-muted)]">
                      {box.expectedEndDate ? new Date(box.expectedEndDate).toLocaleDateString('ar-LY') : '—'}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/safeboxes/${box.id}`}
                        className="text-[var(--gold)] hover:underline text-xs"
                      >
                        التفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <EditGuestModal open={showEdit} onClose={() => setShowEdit(false)} guest={guest} onSuccess={fetchGuest} />
      <WalletTransactionModal
        open={walletModal.open}
        onClose={() => setWalletModal({ open: false, type: 'DEPOSIT' })}
        guestId={guest.id}
        type={walletModal.type}
        onSuccess={fetchGuest}
      />
    </div>
  );
}
