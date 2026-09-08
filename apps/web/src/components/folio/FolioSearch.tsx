'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, Input } from '@/components/ui';
import { apiGet } from '@/lib/utils/api-client';
import { showErrorModal } from '@/components/ui/error-modal';

interface Props {
  onSearch: (bookingId: string) => void;
}

interface SearchItem {
  bookingId: string;
  bookingNo: string;
  folioId: string | null;
  guestName: string | null;
  hasFolio: boolean;
}

export function FolioSearch({ onSearch }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    const term = searchInput.trim();
    if (!term) {
      setResults([]);
      setSearched(false);
      setOpen(false);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiGet(`/api/admin/folios/search?q=${encodeURIComponent(term)}`);
        if (seq !== requestSeq.current) return;
        if (res.success) {
          setResults(res.data?.items || []);
          setSearched(true);
          setOpen(true);
        } else {
          setResults([]);
          setSearched(true);
          setOpen(true);
        }
      } catch {
        if (seq === requestSeq.current) showErrorModal('فشل الاتصال');
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput]);

  function handleSelect(item: SearchItem) {
    onSearch(item.bookingId);
    setOpen(false);
    setSearched(false);
  }

  return (
    <Card title="🔍 بحث عن فاتورة">
      <div className="space-y-3">
        <Input
          placeholder="البحث برقم الحجز أو رقم الفاتورة..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />

        {open && searchInput.trim() && (
          <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--bg-card)]">
            {searching && (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">جاري البحث...</div>
            )}

            {!searching && results.length > 0 && (
              <ul className="divide-y divide-[var(--border)] max-h-64 overflow-y-auto">
                {results.map((item) => (
                  <li
                    key={item.bookingId}
                    onClick={() => handleSelect(item)}
                    className="px-3 py-2.5 cursor-pointer hover:bg-[var(--bg-primary)] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--gold)] text-sm">#{item.bookingNo}</span>
                      {!item.hasFolio && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-muted)]">
                          بدون فاتورة
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {item.guestName || 'غير محدد'}
                      {item.folioId && <span className="text-[var(--text-muted)]"> · فاتورة #{item.folioId.slice(0, 8)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!searching && searched && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">لا توجد نتائج للبحث</div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
