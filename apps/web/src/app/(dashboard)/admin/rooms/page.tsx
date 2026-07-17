'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Modal, Input, Select, Card, EmptyState } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { addToast } from '@/lib/utils/toast';

interface RoomType {
  id: string;
  name: string;
  nameAr?: string;
  baseRate: number;
  capacity: number;
}

interface Room {
  id: string;
  roomNumber: string;
  floor: number;
  status: string;
  roomType: RoomType;
}

export default function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoom, setNewRoom] = useState({ roomNumber: '', floor: '', roomTypeId: '', notes: '' });
  const [showCreateType, setShowCreateType] = useState(false);
  const [newType, setNewType] = useState({ name: '', nameAr: '', baseRate: '', capacity: '2', description: '', images: [] as string[] });
  const [uploading, setUploading] = useState(false);
  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const url = URL.createObjectURL(file);
      setNewType(prev => ({ ...prev, images: [...prev.images, url] }));
    } finally {
      setUploading(false);
    }
  };

  async function fetchRooms() {
    setLoading(true);
    try {
      const [roomsRes, typesRes] = await Promise.all([
        fetch('/api/admin/rooms', {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        }),
        fetch('/api/admin/room-types', {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        }),
      ]);
      const roomsData = await roomsRes.json();
      const typesData = await typesRes.json();
      if (roomsData.success) setRooms(roomsData.data);
      if (typesData.success) setRoomTypes(typesData.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRooms(); }, []);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    await getCsrfToken();
    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          ...newRoom,
          floor: parseInt(newRoom.floor) || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', '✅ تم إضافة الغرفة بنجاح');
        setShowCreate(false);
        setNewRoom({ roomNumber: '', floor: '', roomTypeId: '', notes: '' });
        fetchRooms();
      } else {
        addToast('error', data.error?.message || 'فشل إضافة الغرفة');
      }
    } catch {
      addToast('error', 'حدث خطأ في الاتصال بالخادم');
    }
  }

  const statusLabels: Record<string, string> = {
    AVAILABLE: 'متاحة', OCCUPIED: 'مشغولة', MAINTENANCE: 'صيانة', DIRTY: 'تحت التنظيف',
  };

  const availableRoomTypes = roomTypes;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🚪 إدارة الغرف</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + غرفة جديدة
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState icon="🚪" title="لا توجد غرف" description="قم بإضافة الغرف الأولى" action={<Button onClick={() => setShowCreate(true)}>إضافة غرفة</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            <Card className="!p-4 text-center">
              <div className="text-2xl mb-1">📊</div>
              <div className="text-lg font-bold text-[var(--gold)]">{rooms.length}</div>
              <div className="text-xs text-[var(--text-muted)]">إجمالي الغرف</div>
            </Card>
            <Card className="!p-4 text-center">
              <div className="text-2xl mb-1">🟢</div>
              <div className="text-lg font-bold text-[var(--green)]">{rooms.filter(r => r.status === 'AVAILABLE').length}</div>
              <div className="text-xs text-[var(--text-muted)]">متاحة</div>
            </Card>
            <Card className="!p-4 text-center">
              <div className="text-2xl mb-1">🔴</div>
              <div className="text-lg font-bold text-[var(--red)]">{rooms.filter(r => r.status === 'OCCUPIED').length}</div>
              <div className="text-xs text-[var(--text-muted)]">مشغولة</div>
            </Card>
            <Card className="!p-4 text-center">
              <div className="text-2xl mb-1">🔧</div>
              <div className="text-lg font-bold text-[var(--yellow)]">{rooms.filter(r => r.status === 'MAINTENANCE').length}</div>
              <div className="text-xs text-[var(--text-muted)]">صيانة</div>
            </Card>
          </div>

          <div className="space-y-2">
            {rooms.map((room) => (
              <div key={room.id} className="flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold">{room.roomNumber}</span>
                  <span className="text-sm text-[var(--text-muted)]">الدور {room.floor || '—'}</span>
                  <Badge variant={room.status === 'AVAILABLE' ? 'green' : room.status === 'OCCUPIED' ? 'red' : 'yellow'}>
                    {statusLabels[room.status] || room.status}
                  </Badge>
                </div>
                <span className="text-sm text-[var(--text-secondary)]">{room.roomType?.name} — {room.roomType?.baseRate} د.ل</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إضافة غرفة جديدة">
        <form onSubmit={createRoom} className="space-y-4">
          <Input label="رقم الغرفة" value={newRoom.roomNumber} onChange={(e) => setNewRoom({ ...newRoom, roomNumber: e.target.value })} required />
          <Input label="الدور" type="number" value={newRoom.floor} onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })} />
          <Select
            label="نوع الغرفة"
            value={newRoom.roomTypeId}
            onChange={(e) => setNewRoom({ ...newRoom, roomTypeId: e.target.value })}
            options={availableRoomTypes.map(rt => ({ value: rt.id, label: `${rt.name || rt.nameAr} (${rt.baseRate} د.ل)` }))}
            placeholder="اختر النوع"
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button type="submit">إضافة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showCreateType} onClose={() => setShowCreateType(false)} title="إضافة نوع غرفة جديد">
        <form onSubmit={async (e) => {
          e.preventDefault();
          await getCsrfToken();
          try {
            await fetch('/api/admin/room-types', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json',
                ...csrfHeaders(),
              },
              body: JSON.stringify({
                name: newType.name,
                nameAr: newType.nameAr,
                baseRate: parseFloat(newType.baseRate),
                capacity: parseInt(newType.capacity),
                description: newType.description,
                images: newType.images,
              }),
            });
            setShowCreateType(false);
            setNewType({ name: '', nameAr: '', baseRate: '', capacity: '2', description: '', images: [] });
          } catch {}
        }} className="space-y-4">
          <Input label="الاسم (عربي)" value={newType.nameAr} onChange={(e) => setNewType({ ...newType, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} />
          <Input label="السعر الأساسي (د.ل)" type="number" value={newType.baseRate} onChange={(e) => setNewType({ ...newType, baseRate: e.target.value })} required />
          <Input label="السعة" type="number" value={newType.capacity} onChange={(e) => setNewType({ ...newType, capacity: e.target.value })} />
    <div data-component="AdminRoomsPage">
            <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">صور الغرفة</label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                className="w-full text-sm text-[var(--text-secondary)] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--bg-card)] file:text-[var(--text-primary)] file:cursor-pointer file:text-xs"
              />
              {uploading && <span className="text-xs text-[var(--gold)]">جاري الرفع...</span>}
            </div>
            {newType.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {newType.images.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-[var(--border)]" />
                    <button
                      type="button"
                      onClick={() => setNewType({ ...newType, images: newType.images.filter((_, j) => j !== i) })}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--red)] text-white text-xs flex items-center justify-center"
                    >&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateType(false)}>إلغاء</Button>
            <Button type="submit">إضافة</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
