'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Modal, Input, Table } from '@/components/ui';
import { apiPost, apiPut, apiDelete } from '@/lib/utils/api-mutation';
import { RoomTypeFormSections } from '@/components/room-types/RoomTypeFormSections';

interface ExtraBed { id?: string; bedType: string; label: string; labelAr: string; price: number; maxCount: number }
interface DefaultService { id?: string; serviceId: string; isFree: boolean; service?: { id: string; name: string; nameAr?: string; price: number } }
interface RoomType {
  id: string; name: string; nameAr?: string; description?: string; baseRate: number; capacity: number;
  amenityServiceIds: string[]; amenities: string[]; images: string[]; _count: { rooms: number }; extraBeds: ExtraBed[]; defaultServices: DefaultService[];
}

export default function AdminRoomTypesPage() {
  const [types, setTypes] = useState<RoomType[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<RoomType | null>(null);
  const [form, setForm] = useState({
    name: '', nameAr: '', description: '', baseRate: '', capacity: '2',
    amenityServiceIds: [] as string[], images: [] as string[],
    extraBeds: [] as ExtraBed[], defaultServices: [] as DefaultService[],
  });

  async function fetchData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const [typesRes, svcRes] = await Promise.all([
        fetch('/api/admin/room-types', { headers }),
        fetch('/api/admin/services', { headers }),
      ]);
      const typesData = await typesRes.json();
      const svcData = await svcRes.json();
      if (typesData.success) setTypes(typesData.data);
      if (svcData.success) setServices(svcData.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, []);

  const initForm = { name: '', nameAr: '', description: '', baseRate: '', capacity: '2', amenityServiceIds: [], images: [], extraBeds: [], defaultServices: [] };

  function openCreate() { setForm({ ...initForm }); setEditTarget(null); setShowModal(true); }

  function openEdit(rt: RoomType) {
    setForm({
      name: rt.name, nameAr: rt.nameAr || '', description: rt.description || '',
      baseRate: String(rt.baseRate), capacity: String(rt.capacity),
      amenityServiceIds: rt.amenityServiceIds || [], images: rt.images || [],
      extraBeds: rt.extraBeds?.map(b => ({ bedType: b.bedType, label: b.label, labelAr: b.labelAr || '', price: b.price, maxCount: b.maxCount })) || [],
      defaultServices: rt.defaultServices?.map(s => ({ serviceId: s.service?.id ?? '', isFree: s.isFree })) || [],
    });
    setEditTarget(rt);
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditTarget(null); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name, nameAr: form.nameAr, description: form.description,
      baseRate: parseFloat(form.baseRate), capacity: parseInt(form.capacity),
      amenityServiceIds: form.amenityServiceIds, images: form.images,
      extraBeds: form.extraBeds.map(b => ({ bedType: b.bedType, label: b.label, labelAr: b.labelAr, price: b.price, maxCount: b.maxCount })),
      defaultServices: form.defaultServices.map(s => ({ serviceId: s.serviceId, isFree: s.isFree })),
    };
    const opts = { successMsg: editTarget ? '✅ تم تحديث نوع الغرفة' : '✅ تم إضافة نوع الغرفة', errorMsg: 'فشل حفظ نوع الغرفة', onSuccess: () => { closeModal(); fetchData(); } };
    if (editTarget) {
      await apiPut(`/api/admin/room-types/${editTarget.id}`, body, opts);
    } else {
      await apiPost('/api/admin/room-types', body, opts);
    }
  }

  async function deleteType(rt: RoomType) {
    if (rt._count.rooms > 0) { alert('لا يمكن حذف نوع غرفة يحتوي على غرف'); return; }
    if (!confirm(`حذف "${rt.nameAr || rt.name}"؟`)) return;
    await apiDelete(`/api/admin/room-types/${rt.id}`, {
      successMsg: '✅ تم حذف نوع الغرفة',
      errorMsg: 'فشل حذف نوع الغرفة',
      onSuccess: () => fetchData(),
    });
  }

  function toggleAmenity(svcId: string) {
    const exists = form.amenityServiceIds.includes(svcId);
    if (exists) setForm({ ...form, amenityServiceIds: form.amenityServiceIds.filter(id => id !== svcId) });
    else setForm({ ...form, amenityServiceIds: [...form.amenityServiceIds, svcId] });
  }
  function addExtraBed() { setForm({ ...form, extraBeds: [...form.extraBeds, { bedType: 'ADULT', label: '', labelAr: '', price: 0, maxCount: 1 }] }); }
  function updateExtraBed(idx: number, field: string, value: any) { const beds = [...form.extraBeds]; (beds[idx] as any)[field] = value; setForm({ ...form, extraBeds: beds }); }
  function removeExtraBed(idx: number) { setForm({ ...form, extraBeds: form.extraBeds.filter((_, i) => i !== idx) }); }
  function toggleDefaultService(svcId: string) {
    const exists = form.defaultServices.find(s => s.serviceId === svcId);
    if (exists) setForm({ ...form, defaultServices: form.defaultServices.filter(s => s.serviceId !== svcId) });
    else setForm({ ...form, defaultServices: [...form.defaultServices, { serviceId: svcId, isFree: true }] });
  }

  const columns = [
    { key: 'name', header: 'النوع', render: (rt: RoomType) => <span className="font-semibold">{rt.nameAr || rt.name}</span> },
    { key: 'baseRate', header: 'السعر', render: (rt: RoomType) => <span className="font-bold text-[var(--gold)]">{rt.baseRate} د.ل</span> },
    { key: 'capacity', header: 'السعة', render: (rt: RoomType) => <span className="text-xs">{rt.capacity} أشخاص</span> },
    { key: 'rooms', header: 'الغرف', render: (rt: RoomType) => <Badge variant="gold">{rt._count.rooms}</Badge> },
    { key: 'amenities', header: 'المزايا', render: (rt: RoomType) => {
      const amenities = Array.isArray(rt.amenities) ? rt.amenities : [];
      return (
        <div className="flex gap-1 flex-wrap max-w-[200px]">
          {amenities.slice(0, 3).map((a, i) => <span key={i} className="text-[10px] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">{a}</span>)}
          {amenities.length > 3 && <span className="text-[10px] text-[var(--text-muted)]">+{amenities.length - 3}</span>}
        </div>
      );
    }},
    { key: 'actions', header: 'إجراءات', render: (rt: RoomType) => (
      <div className="flex gap-2">
        <button onClick={() => openEdit(rt)} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
        <button onClick={() => deleteType(rt)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
      </div>
    )},
  ];

  return (
    <div data-component="AdminRoomTypesPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🏗️ أنواع الغرف</h1>
        <Button onClick={openCreate}>+ نوع جديد</Button>
      </div>

      <Table columns={columns} data={types} keyExtractor={rt => rt.id} loading={loading} emptyMessage="لا توجد أنواع غرف بعد" />

      <Modal open={showModal} onClose={closeModal} title={editTarget ? `تعديل: ${editTarget.nameAr || editTarget.name}` : 'إضافة نوع غرفة جديد'} size="lg">
        <form onSubmit={save} className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Input label="الاسم (عربي)" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
            <Input label="الاسم (إنجليزي)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <Input label="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="السعر الأساسي (د.ل)" type="number" value={form.baseRate} onChange={(e) => setForm({ ...form, baseRate: e.target.value })} required />
            <Input label="السعة (أشخاص)" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>

          <RoomTypeFormSections
            amenityServiceIds={form.amenityServiceIds}
            extraBeds={form.extraBeds} defaultServices={form.defaultServices}
            allServices={services}
            onToggleAmenity={toggleAmenity}
            onRemoveAmenity={(svcId) => setForm({ ...form, amenityServiceIds: form.amenityServiceIds.filter(id => id !== svcId) })}
            onAddExtraBed={addExtraBed}
            onUpdateExtraBed={updateExtraBed}
            onRemoveExtraBed={removeExtraBed}
            onToggleDefaultService={toggleDefaultService}
          />

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)] sticky bottom-0 bg-[var(--bg-secondary)] py-2">
            <Button variant="secondary" type="button" onClick={closeModal}>إلغاء</Button>
            <Button type="submit">{editTarget ? 'حفظ التعديلات' : 'إضافة'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
