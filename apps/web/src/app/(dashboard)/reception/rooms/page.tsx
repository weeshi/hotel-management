'use client';

import { useState, useEffect } from 'react';

interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  status: string;
  housekeepingStatus: string;
  roomType: { name: string; baseRate: number };
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/admin/rooms', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setRooms(data.data);
      });
  }, []);

  const filtered = filter
    ? rooms.filter((r) => r.status === filter)
    : rooms;

  const statusColors: Record<string, string> = {
    AVAILABLE: 'tag-green',
    OCCUPIED: 'tag-red',
    MAINTENANCE: 'tag-yellow',
    DIRTY: 'tag-blue',
  };

  const statusLabels: Record<string, string> = {
    AVAILABLE: 'متاحة',
    OCCUPIED: 'مشغولة',
    MAINTENANCE: 'صيانة',
    DIRTY: 'تحت التنظيف',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🚪 إدارة الغرف</h1>
        <div className="flex gap-2">
          {['', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'DIRTY'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === s
                  ? 'bg-[var(--gold)] text-black'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              {statusLabels[s as keyof typeof statusLabels] || 'الكل'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filtered.map((room) => (
          <div
            key={room.id}
            className="card !p-4 text-center"
          >
            <div className="text-2xl mb-2">
              {room.status === 'OCCUPIED' ? '🔴' : room.status === 'MAINTENANCE' ? '🔧' : '🟢'}
            </div>
            <div className="text-xl font-bold">{room.roomNumber}</div>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              {room.roomType?.name || 'غير محدد'}
            </div>
            <div className="flex gap-2 justify-center">
              <span className={`tag ${statusColors[room.status] || 'tag-gold'}`}>
                {statusLabels[room.status] || room.status}
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2">
              {room.roomType?.baseRate} د.ل/ليلة
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          لا توجد غrooms
        </div>
      )}
    </div>
  );
}
