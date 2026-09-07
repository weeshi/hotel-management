'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Select, Modal, Badge, EmptyState, Table } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';
import { apiPost, apiPut, apiDelete } from '@/lib/utils/api-mutation';

interface ServiceCategory {
  id: string; name: string; nameAr?: string; icon?: string; _count: { services: number };
}

interface Service {
  id: string; name: string; nameAr?: string; description?: string;
  price: number; capacityIncrease: number; isActive: boolean; categoryId: string; category: ServiceCategory;
}

export default function AdminServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<Service | null>(null);
  const [filterCat, setFilterCat] = useState('');
  const [form, setForm] = useState({ name: '', nameAr: '', description: '', price: '', capacityIncrease: '0', categoryId: '', isActive: true });
  const [editForm, setEditForm] = useState({ name: '', nameAr: '', description: '', price: '', capacityIncrease: '0', categoryId: '', isActive: true });

  const [showCatModal, setShowCatModal] = useState(false);
  const [editCatTarget, setEditCatTarget] = useState<ServiceCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: '', nameAr: '', icon: '' });

  async function fetchData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const [svcRes, catRes] = await Promise.all([
        fetch(`/api/admin/services${filterCat ? `?categoryId=${filterCat}` : ''}`, { headers }),
        fetch('/api/admin/service-categories', { headers }),
      ]);
      const svcData = await svcRes.json();
      const catData = await catRes.json();
      if (svcData.success) setServices(svcData.data);
      if (catData.success) setCategories(catData.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, [filterCat]);

  async function createService(e: React.FormEvent) {
    e.preventDefault();
    const ok = await apiPost('/api/admin/services', { ...form, price: parseFloat(form.price), capacityIncrease: parseInt(form.capacityIncrease) || 0 }, {
      successMsg: '✅ تمت إضافة الخدمة بنجاح',
      errorMsg: 'فشل إضافة الخدمة',
      onSuccess: () => { setShowCreate(false); setForm({ name: '', nameAr: '', description: '', price: '', capacityIncrease: '0', categoryId: '', isActive: true }); fetchData(); },
    });
  }

  async function updateService(e: React.FormEvent) {
    e.preventDefault();
    if (!showEdit) return;
    const ok = await apiPut(`/api/admin/services/${showEdit.id}`, { ...editForm, price: parseFloat(editForm.price), capacityIncrease: parseInt(editForm.capacityIncrease) || 0 }, {
      successMsg: '✅ تم تحديث الخدمة بنجاح',
      errorMsg: 'فشل تحديث الخدمة',
      onSuccess: () => { setShowEdit(null); fetchData(); },
    });
  }

  async function deleteService(svc: Service) {
    if (!confirm(`هل أنت متأكد من حذف "${svc.name}"؟`)) return;
    const ok = await apiDelete(`/api/admin/services/${svc.id}`, {
      successMsg: '✅ تم حذف الخدمة',
      errorMsg: 'فشل حذف الخدمة',
      onSuccess: () => fetchData(),
    });
  }

  function openCreateCat() { setCatForm({ name: '', nameAr: '', icon: '' }); setEditCatTarget(null); setShowCatModal(true); }

  function openEditCat(cat: ServiceCategory) {
    setCatForm({ name: cat.name, nameAr: cat.nameAr || '', icon: cat.icon || '' });
    setEditCatTarget(cat);
    setShowCatModal(true);
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    const url = editCatTarget ? `/api/admin/service-categories/${editCatTarget.id}` : '/api/admin/service-categories';
    const method = editCatTarget ? 'PUT' : 'POST';
    if (method === 'POST') {
      await apiPost(url, catForm, {
        successMsg: '✅ تمت إضافة الفئة',
        errorMsg: 'فشل إضافة الفئة',
        onSuccess: () => { setShowCatModal(false); fetchData(); },
      });
    } else {
      await apiPut(url, catForm, {
        successMsg: '✅ تم تحديث الفئة',
        errorMsg: 'فشل تحديث الفئة',
        onSuccess: () => { setShowCatModal(false); fetchData(); },
      });
    }
  }

  async function deleteCategory(cat: ServiceCategory) {
    if (cat._count.services > 0) { alert('لا يمكن حذف فئة تحتوي على خدمات'); return; }
    if (!confirm(`حذف الفئة "${cat.nameAr || cat.name}"؟`)) return;
    await apiDelete(`/api/admin/service-categories/${cat.id}`, {
      successMsg: '✅ تم حذف الفئة',
      errorMsg: 'فشل حذف الفئة',
      onSuccess: () => fetchData(),
    });
  }

  const columns = [
    { key: 'name', header: 'الاسم', render: (s: Service) => <span className="font-semibold">{s.nameAr || s.name}</span> },
    { key: 'category', header: 'الفئة', render: (s: Service) => <span className="text-xs text-[var(--text-muted)]">{s.category?.nameAr || s.category?.name}</span> },
    { key: 'price', header: 'السعر', render: (s: Service) => <span className="font-bold text-[var(--gold)]">{s.price.toFixed(2)} د.ل</span> },
    { key: 'isActive', header: 'الحالة', render: (s: Service) => <Badge variant={s.isActive ? 'green' : 'red'}>{s.isActive ? 'نشط' : 'موقوف'}</Badge> },
    { key: 'actions', header: 'إجراءات', render: (s: Service) => (
      <div className="flex gap-2">
        <button onClick={() => { setEditForm({ name: s.name, nameAr: s.nameAr || '', description: s.description || '', price: String(s.price), capacityIncrease: String(s.capacityIncrease || 0), categoryId: s.categoryId, isActive: s.isActive }); setShowEdit(s); }} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
        <button onClick={() => deleteService(s)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
      </div>
    )},
  ];

  return (
    <div data-component="AdminServicesPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🛎️ إدارة الخدمات</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openCreateCat}>📂 إدارة الفئات</Button>
          <Button onClick={() => setShowCreate(true)}>+ خدمة جديدة</Button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <Select
          label="تصفية حسب الفئة"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          options={[
            { value: '', label: 'الكل' },
            ...categories.map((c) => ({ value: c.id, label: c.nameAr || c.name })),
          ]}
        />
      </div>

      <Table columns={columns} data={services} keyExtractor={(s) => s.id} loading={loading} emptyMessage="لا توجد خدمات بعد" />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="إضافة خدمة جديدة">
        <form onSubmit={createService} className="space-y-4">
          <Input label="الاسم (عربي)" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="السعر (د.ل)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <Input label="زيادة السعة (عدد أشخاص)" type="number" value={form.capacityIncrease} onChange={(e) => setForm({ ...form, capacityIncrease: e.target.value })} />
          <Select label="الفئة" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} options={categories.map((c) => ({ value: c.id, label: c.nameAr || c.name }))} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button type="submit">إضافة</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="تعديل خدمة">
        <form onSubmit={updateService} className="space-y-4">
          <Input label="الاسم (عربي)" value={editForm.nameAr} onChange={(e) => setEditForm({ ...editForm, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Input label="الوصف" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <Input label="السعر (د.ل)" type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} required />
          <Input label="زيادة السعة (عدد أشخاص)" type="number" value={editForm.capacityIncrease} onChange={(e) => setEditForm({ ...editForm, capacityIncrease: e.target.value })} />
          <Select label="الفئة" value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} options={categories.map((c) => ({ value: c.id, label: c.nameAr || c.name }))} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEdit(null)}>إلغاء</Button>
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showCatModal} onClose={() => setShowCatModal(false)} title={editCatTarget ? 'تعديل فئة' : 'إضافة فئة جديدة'}>
        <form onSubmit={saveCategory} className="space-y-4">
          <Input label="الاسم (عربي)" value={catForm.nameAr} onChange={(e) => setCatForm({ ...catForm, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
          <Input label="الأيقونة (مثل 🍽️)" value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} />
          {editCatTarget && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <span>الخدمات المرتبطة: {editCatTarget._count.services}</span>
              {editCatTarget._count.services > 0 && (
                <span className="text-[var(--yellow)]">(انقل الخدمات أولا لحذف الفئة)</span>
              )}
            </div>
          )}
          <div className="flex gap-2 justify-between pt-2">
            <div className="flex gap-2">
              {editCatTarget && editCatTarget._count.services === 0 && (
                <Button variant="secondary" type="button" onClick={() => deleteCategory(editCatTarget)}>🗑️ حذف</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" type="button" onClick={() => setShowCatModal(false)}>إلغاء</Button>
              <Button type="submit">{editCatTarget ? 'حفظ' : 'إضافة'}</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
