'use client';

import type { MenuCategory, MenuItem } from './types';

interface Props {
  categories: MenuCategory[];
  activeCat: string;
  searchTerm: string;
  items: MenuItem[];
  loading: boolean;
  onSelectCategory: (id: string) => void;
  onSearchChange: (term: string) => void;
  onAddToCart: (item: MenuItem) => void;
}

export function MenuPanel({ categories, activeCat, searchTerm, items, loading, onSelectCategory, onSearchChange, onAddToCart }: Props) {
  const filtered = items.filter(i => i.isActive !== false)
    .filter(i => !activeCat || i.categoryId === activeCat)
    .filter(i => searchTerm ? (i.nameAr || i.name).includes(searchTerm) : true);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex gap-1 p-3 border-b border-[var(--border)] overflow-x-auto">
        <button onClick={() => onSelectCategory('')}
          className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${!activeCat ? 'bg-[var(--gold)] text-black font-semibold' : 'hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]'}`}>
          الكل
        </button>
        {categories.map(c => (
          <button key={c.id} onClick={() => onSelectCategory(c.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${activeCat === c.id ? 'bg-[var(--gold)] text-black font-semibold' : 'hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]'}`}>
            {c.icon} {c.nameAr || c.name}
          </button>
        ))}
      </div>

      <div className="px-3 py-2 border-b border-[var(--border)]">
        <input type="text" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)}
          placeholder="🔍 بحث..."
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--gold)]" />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)]">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)]">لا توجد عناصر</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map(item => (
              <button key={item.id} onClick={() => onAddToCart(item)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-3 text-right hover:border-[var(--gold)] transition-all hover:shadow-lg hover:shadow-[var(--gold)]/5">
                <div className="text-3xl mb-2">{item.image || '🍽️'}</div>
                <div className="font-semibold text-sm">{item.nameAr || item.name}</div>
                {item.nameAr && item.name && <div className="text-xs text-[var(--text-muted)]">{item.name}</div>}
                <div className="font-bold text-[var(--gold)] mt-1">{item.price.toFixed(2)} د.ل</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
