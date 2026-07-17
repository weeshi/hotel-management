'use client';

import { useState, useEffect } from 'react';
import { subscribeToasts, removeToast, type Toast } from '@/lib/utils/toast';

const typeStyles: Record<string, string> = {
  success: 'bg-[var(--green)] text-white',
  error: 'bg-[var(--red)] text-white',
  info: 'bg-[var(--blue)] text-white',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsub = subscribeToasts(setToasts);
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${typeStyles[t.type]} px-4 py-3 rounded-xl shadow-xl text-sm font-semibold flex items-center gap-2 animate-slide-up cursor-pointer`}
          onClick={() => removeToast(t.id)}
        >
          <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
          <span className="flex-1">{t.message}</span>
          <button className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  );
}
