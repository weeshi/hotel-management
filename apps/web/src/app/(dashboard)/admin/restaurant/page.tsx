'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Modal, Input, Select, Card, Table } from '@/components/ui';
import { getCsrfToken, csrfHeaders } from '@/lib/utils/csrf';

interface MenuCategory {
  id: string;
  name: string;
  nameAr?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  _count: { menuItems: number };
}

interface MenuItem {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  price: number;
  image?: string;
  isActive: boolean;
  categoryId: string;
  category: MenuCategory;
}

export default function AdminRestaurantPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'categories' | 'items'>('categories');
  const [filterCat, setFilterCat] = useState('');

  // Category modal state
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<MenuCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: '', nameAr: '', icon: '', sortOrder: '0' });

  // Item modal state
  const [showItemModal, setShowItemModal] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', nameAr: '', description: '', price: '', categoryId: '', image: '' });

  async function fetchData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}` };
      const catUrl = '/api/admin/menu-categories';
      const itemUrl = filterCat ? `/api/admin/menu-items?categoryId=${filterCat}` : '/api/admin/menu-items';
      const [catRes, itemRes] = await Promise.all([
        fetch(catUrl, { headers }),
        fetch(itemUrl, { headers }),
      ]);
      const catData = await catRes.json();
      const itemData = await itemRes.json();
      if (catData.success) setCategories(catData.data);
      if (itemData.success) setItems(itemData.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [filterCat]);

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    await getCsrfToken();
    try {
      const body = { ...catForm, sortOrder: parseInt(catForm.sortOrder) || 0 };
      if (editCat) {
        await fetch(`/api/admin/menu-categories/${editCat.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify(body),
        });
      } else {
        await fetch('/api/admin/menu-categories', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify(body),
        });
      }
      setShowCatModal(false);
      setEditCat(null);
      setCatForm({ name: '', nameAr: '', icon: '', sortOrder: '0' });
      fetchData();
    } catch {}
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    await getCsrfToken();
    try {
      const body = { ...itemForm, price: parseFloat(itemForm.price) };
      if (editItem) {
        await fetch(`/api/admin/menu-items/${editItem.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify(body),
        });
      } else {
        await fetch('/api/admin/menu-items', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify(body),
        });
      }
      setShowItemModal(false);
      setEditItem(null);
      setItemForm({ name: '', nameAr: '', description: '', price: '', categoryId: '', image: '' });
      fetchData();
    } catch {}
  }

  async function deleteCategory(cat: MenuCategory) {
    if (cat._count.menuItems > 0) { alert('لا يمكن حذف تصنيف يحتوي على عناصر'); return; }
    if (!confirm(`حذف "${cat.name}"؟`)) return;
    await getCsrfToken();
    try {
      await fetch(`/api/admin/menu-categories/${cat.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, ...csrfHeaders() },
      });
      fetchData();
    } catch {}
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(`حذف "${item.name}"؟`)) return;
    await getCsrfToken();
    try {
      await fetch(`/api/admin/menu-items/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, ...csrfHeaders() },
      });
      fetchData();
    } catch {}
  }

  const catColumns = [
    { key: 'name', header: 'الاسم', render: (c: MenuCategory) => <span className="font-semibold">{c.icon} {c.nameAr || c.name}</span> },
    { key: 'sortOrder', header: 'الترتيب', render: (c: MenuCategory) => <span className="text-xs text-[var(--text-muted)]">{c.sortOrder}</span> },
    { key: 'items', header: 'العناصر', render: (c: MenuCategory) => <Badge variant="gold">{c._count.menuItems}</Badge> },
    { key: 'actions', header: 'إجراءات', render: (c: MenuCategory) => (
      <div className="flex gap-2">
        <button onClick={() => { setCatForm({ name: c.name, nameAr: c.nameAr || '', icon: c.icon || '', sortOrder: String(c.sortOrder) }); setEditCat(c); setShowCatModal(true); }} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
        <button onClick={() => deleteCategory(c)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
      </div>
    )},
  ];

  const itemColumns = [
    { key: 'name', header: 'الاسم', render: (i: MenuItem) => <span className="font-semibold">{i.nameAr || i.name}</span> },
    { key: 'category', header: 'التصنيف', render: (i: MenuItem) => <span className="text-xs text-[var(--text-muted)]">{i.category?.nameAr || i.category?.name}</span> },
    { key: 'price', header: 'السعر', render: (i: MenuItem) => <span className="font-bold text-[var(--gold)]">{i.price.toFixed(2)} د.ل</span> },
    { key: 'isActive', header: 'الحالة', render: (i: MenuItem) => <Badge variant={i.isActive ? 'green' : 'red'}>{i.isActive ? 'نشط' : 'موقوف'}</Badge> },
    { key: 'actions', header: 'إجراءات', render: (i: MenuItem) => (
      <div className="flex gap-2">
        <button onClick={() => { setItemForm({ name: i.name, nameAr: i.nameAr || '', description: i.description || '', price: String(i.price), categoryId: i.categoryId, image: i.image || '' }); setEditItem(i); setShowItemModal(true); }} className="text-xs text-[var(--blue)] hover:underline">تعديل</button>
        <button onClick={() => deleteItem(i)} className="text-xs text-[var(--red)] hover:underline">حذف</button>
      </div>
    )},
  ];

  return (
    <div data-component="AdminRestaurantPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🍽️ إدارة المطعم</h1>
        <Button onClick={() => tab === 'categories' ? setShowCatModal(true) : setShowItemModal(true)}>
          {tab === 'categories' ? '+ تصنيف جديد' : '+ عنصر جديد'}
        </Button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex gap-2">
          <button onClick={() => setTab('categories')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'categories' ? 'bg-[var(--gold)] text-black' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>التصنيفات</button>
          <button onClick={() => setTab('items')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'items' ? 'bg-[var(--gold)] text-black' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>عناصر القائمة</button>
        </div>
        {tab === 'items' && (
          <Select label="تصفية" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
            options={[{ value: '', label: 'الكل' }, ...categories.map(c => ({ value: c.id, label: c.nameAr || c.name }))]}
          />
        )}
      </div>

      {tab === 'categories' ? (
        <Table columns={catColumns} data={categories} keyExtractor={c => c.id} loading={loading} emptyMessage="لا توجد تصنيفات" />
      ) : (
        <Table columns={itemColumns} data={items} keyExtractor={i => i.id} loading={loading} emptyMessage="لا توجد عناصر" />
      )}

      <Modal open={showCatModal} onClose={() => { setShowCatModal(false); setEditCat(null); }} title={editCat ? 'تعديل تصنيف' : 'إضافة تصنيف'}>
        <form onSubmit={saveCategory} className="space-y-4">
          <Input label="الاسم (عربي)" value={catForm.nameAr} onChange={(e) => setCatForm({ ...catForm, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
          <Input label="الأيقونة" value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} placeholder="🍕" />
          <Input label="الترتيب" type="number" value={catForm.sortOrder} onChange={(e) => setCatForm({ ...catForm, sortOrder: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowCatModal(false); setEditCat(null); }}>إلغاء</Button>
            <Button type="submit">{editCat ? 'حفظ' : 'إضافة'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showItemModal} onClose={() => { setShowItemModal(false); setEditItem(null); }} title={editItem ? 'تعديل عنصر' : 'إضافة عنصر'}>
        <form onSubmit={saveItem} className="space-y-4">
          <Input label="الاسم (عربي)" value={itemForm.nameAr} onChange={(e) => setItemForm({ ...itemForm, nameAr: e.target.value })} required />
          <Input label="الاسم (إنجليزي)" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
          <Input label="الوصف" value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
          <Input label="السعر (د.ل)" type="number" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} required />
          <Select label="التصنيف" value={itemForm.categoryId} onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
            options={categories.map(c => ({ value: c.id, label: c.nameAr || c.name }))}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowItemModal(false); setEditItem(null); }}>إلغاء</Button>
            <Button type="submit">{editItem ? 'حفظ' : 'إضافة'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
