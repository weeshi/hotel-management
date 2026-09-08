'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';

interface RoomType {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  baseRate: number;
  capacity: number;
  amenities?: string;
  _count: { rooms: number };
}

export default function PublicRoomsPage() {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public/room-types')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setRoomTypes(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-4">🛏️ غرفنا</h1>
        <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
          اختر الغرفة التي تناسب احتياجاتك. نقدم أنواعاً متعددة من الغرف لتلبية تطلعاتك.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roomTypes.map((type) => (
            <div key={type.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--border-gold)] transition-all">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold">{type.nameAr || type.name}</h3>
                  <span className="text-sm text-[var(--text-muted)]">{type.capacity} أشخاص</span>
                </div>
                {type.description && (
                  <p className="text-sm text-[var(--text-secondary)] mb-4">{type.description}</p>
                )}
                {type.amenities && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {JSON.parse(type.amenities).map((a: string) => (
                      <span key={a} className="text-xs px-2 py-1 rounded-md bg-[var(--bg-primary)] text-[var(--text-muted)]">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                  <div>
                    <span className="text-2xl font-bold text-[var(--gold)]">{type.baseRate}</span>
                    <span className="text-sm text-[var(--text-muted)] mr-1">د.ل / ليلة</span>
                  </div>
                  <Link
                    href={`/book?roomTypeId=${type.id}`}
                    className="px-4 py-2 rounded-xl bg-[var(--gold)] text-black font-bold text-sm hover:brightness-110 transition-all"
                  >
                    احجز الآن
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
