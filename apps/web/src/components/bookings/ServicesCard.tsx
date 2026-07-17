'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '@/lib/utils/api-client';

interface Service {
  id: string;
  name: string;
  nameAr?: string | null;
  price: number;
  category?: { nameAr?: string | null; name: string } | null;
}

interface Props {
  selectedServices: Record<string, number>;
  onServicesChange: (services: Record<string, number>) => void;
}

export function ServicesCard({ selectedServices, onServicesChange }: Props) {
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    apiGet('/api/admin/services').then(res => {
      if (res.success) setServices(res.data);
    });
  }, []);

  const totalServicePrice = Object.entries(selectedServices).reduce((sum, [id, qty]) => {
    const svc = services.find(s => s.id === id);
    return sum + (svc ? svc.price * qty : 0);
  }, 0);

  function toggleService(svc: Service) {
    onServicesChange({
      ...selectedServices,
      [svc.id]: selectedServices[svc.id] ? 0 : 1,
    });
  }

  function setQuantity(id: string, qty: number) {
    if (qty <= 0) {
      const { [id]: _, ...rest } = selectedServices;
      onServicesChange(rest);
    } else {
      onServicesChange({ ...selectedServices, [id]: qty });
    }
  }

  if (services.length === 0) return null;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="font-bold text-sm mb-4">🛎️ خدمات إضافية</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {services.map(svc => (
          <div key={svc.id} className="flex items-center justify-between py-1.5">
            <label className="flex items-center gap-2 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={!!selectedServices[svc.id]}
                onChange={() => toggleService(svc)}
                className="accent-[var(--gold)]"
              />
              <span className="text-sm">{svc.nameAr || svc.name}</span>
              <span className="text-xs text-[var(--text-muted)]">({svc.price} د.ل)</span>
            </label>
            {selectedServices[svc.id] ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setQuantity(svc.id, selectedServices[svc.id] - 1)}
                  className="w-7 h-7 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm flex items-center justify-center">−</button>
                <span className="text-sm font-medium w-6 text-center">{selectedServices[svc.id]}</span>
                <button type="button" onClick={() => setQuantity(svc.id, selectedServices[svc.id] + 1)}
                  className="w-7 h-7 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm flex items-center justify-center">+</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {totalServicePrice > 0 && (
        <div className="border-t border-[var(--border)] pt-2 mt-2 flex justify-between text-sm">
          <span className="text-[var(--text-muted)]">إجمالي الخدمات</span>
          <span className="font-semibold text-[var(--gold)]">{totalServicePrice} د.ل</span>
        </div>
      )}
    </div>
  );
}
