'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Input, Select, Modal, Table } from '@/components/ui';
import { apiPost, apiPut, apiDelete } from '@/lib/utils/api-mutation';

interface TaskType { id: string; name: string; nameAr?: string; icon?: string; sortOrder: number; isActive: boolean }

export default function AdminTaskTypesPage() {
  const [types, setTypes] = useState<TaskType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<TaskType | null>(null);
  const [form, setForm] = useState({ name: '', nameAr: '', icon: '', sortOrder: 0 });

  async function fetchTypes() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/admin/task-types', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setTypes(data.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchTypes(); }, []);

  function openCreate() { setForm({ name: '', nameAr: '', icon: '', sortOrder: types.length + 1 }); setEditTarget(null); setShowModal(true); }

  function openEdit(tt: TaskType) {
    setForm({ name: tt.name, nameAr: tt.nameAr || '', icon: tt.icon || '', sortOrder: tt.sortOrder });
    setEditTarget(tt);
    setShowModal(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const opts = { successMsg: editTarget ? '✅ تم تحديث نوع المهمة' : '✅ تم إضافة نوع المهمة', errorMsg: 'فشل حفظ نوع المهمة', onSuccess: () => { setShowModal(false); fetchTypes(); } };
    if (editTarget) {
      await apiPut(`/api/admin/task-types/${editTarget.id}`, form, opts);
    } else {
      await apiPost('/api/admin/task-types', form, opts);
    }
  }

  async function deleteType(tt: TaskType) {
    if (!confirm(`حذف "${tt.nameAr || tt.name}"؟`)) return;
    await apiDelete(`/api/admin/task-types/${tt.id}`, {
      successMsg: '✅ تم حذف نوع المهمة',
      errorMsg: 'فشل حذف نوع المهمة',
      onSuccess: () => fetchTypes(),
    });
  }

  const columns = [
    { key: 'icon', header: '', render: (tt: TaskType) => <span className="text-lg">{tt.icon || '📋'}</span> },
    { key: 'nameAr', header: 'الاسم', render: (tt: TaskType) => <span className="font-semibold">{tt.nameAr || tt.name}</span> },
    { key: 'name', header: 'الكود', render: (tt: TaskType) => <span className="text-xs text-[var(--text-muted)] font-mono">{tt.name}</span> },
    { key: 'sortOrder', header: 'الترتيب', render: (tt: TaskType) => <span className="text-xs">{tt.sortOrder}</span> },
    { key: 'isActive', header: 'الحالة', render: (tt: TaskType) => <Badge variant={tt.isActive ? 'green' : 'red'}>{tt.isActive ? 'نشط' : 'موقوف'}</Badge> },
    { key: 'actions', header: 'إجراءات', render: (tt: TaskType) => (
      <div className="flex gap-2">
        <button onClick={() => openEdit(tt)} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
        <button onClick={() => deleteType(tt)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
      </div>
    )},
  ];

  return (
    <div data-component="AdminTaskTypesPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📋 إدارة أنواع المهام</h1>
        <Button onClick={openCreate}>+ نوع جديد</Button>
      </div>

      <Table columns={columns} data={types} keyExtractor={tt => tt.id} loading={loading} emptyMessage="لا توجد أنواع مهام بعد" />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTarget ? 'تعديل نوع المهمة' : 'إضافة نوع مهمة جديد'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="الاسم (عربي)" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          <Input label="الكود (إنجليزي)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CLEANING, MAINTENANCE, ..." required />
          <Input label="الأيقونة (مثل 🧹)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          <Input label="ترتيب العرض" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          <div className="flex gap-2 justify-between pt-2">
            {editTarget && (
              <Button variant="secondary" type="button" onClick={() => deleteType(editTarget)}>🗑️ حذف</Button>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
              <Button type="submit">{editTarget ? 'حفظ' : 'إضافة'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
