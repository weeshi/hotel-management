'use client';

import { useState, useEffect, useRef } from 'react';
import { apiGet } from '@/lib/utils/api-client';

interface GuestResult {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface Props {
  onSelect: (guest: GuestResult) => void;
  placeholder?: string;
}

export function GuestSearchCombobox({ onSelect, placeholder = 'بحث عن نزيل...' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GuestResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiGet(`/api/admin/guests/search?q=${encodeURIComponent(query)}`);
        if (res.success) {
          setResults(res.data);
          setOpen(res.data.length > 0);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  function handleSelect(guest: GuestResult) {
    onSelect(guest);
    setQuery(guest.name);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
      />
      {loading && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <svg className="animate-spin h-4 w-4 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xl">
          {results.map((guest) => (
            <button
              key={guest.id}
              type="button"
              onClick={() => handleSelect(guest)}
              className="w-full text-right px-4 py-3 hover:bg-[var(--bg-card)] transition-colors text-sm"
            >
              <div className="font-medium">{guest.name}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {[guest.email, guest.phone].filter(Boolean).join(' | ') || ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
