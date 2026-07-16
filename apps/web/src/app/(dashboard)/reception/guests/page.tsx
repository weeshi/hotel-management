'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { GuestsTable, CreateGuestModal, EditGuestModal } from '@/components/guests';
import { apiGet } from '@/lib/utils/api-client';

interface GuestRow {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  loyaltyPoints: number;
  createdAt: string;
  wallet?: { balance: number } | null;
  _count?: { bookings: number };
}

export default function ReceptionGuestsPage() {
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);

  async function fetchGuests() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (searchQuery) params.set('query', searchQuery);
      if (nationalityFilter) params.set('nationality', nationalityFilter);

      const res = await apiGet(`/api/admin/guests?${params}`);
      if (res.success) {
        setGuests(res.data);
        setTotalPages(res.pagination?.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchGuests(); }, [page, searchQuery, nationalityFilter]);

  return (
    <div data-component="ReceptionGuestsPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">👤 النزلاء</h1>
        <Button onClick={() => setShowCreate(true)}>+ إضافة نزيل</Button>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          className="flex-1 px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
          placeholder="🔍 بحث بالاسم أو البريد أو الهاتف..."
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
        />
        <input
          className="w-48 px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--gold)] transition-colors"
          placeholder="🌍 فلتر بالجنسية..."
          value={nationalityFilter}
          onChange={e => { setNationalityFilter(e.target.value); setPage(1); }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
            <GuestsTable
              guests={guests}
              basePath="/reception/guests"
            />
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] disabled:opacity-40"
              >
                → السابق
              </button>
              <span className="text-sm text-[var(--text-secondary)]">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] disabled:opacity-40"
              >
                التالي ←
              </button>
            </div>
          )}
        </>
      )}

      <CreateGuestModal open={showCreate} onClose={() => setShowCreate(false)} onSuccess={fetchGuests} />
      <EditGuestModal open={!!editingGuest} onClose={() => setEditingGuest(null)} guest={editingGuest} onSuccess={fetchGuests} />
    </div>
  );
}
