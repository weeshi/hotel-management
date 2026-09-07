'use client';

import { useState, useEffect } from 'react';
import { Modal } from './modal';

type ErrorListener = (message: string | null) => void;

let listeners: ErrorListener[] = [];
let currentMessage: string | null = null;

function safeToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.error === 'object' && obj.error !== null && typeof (obj.error as any).message === 'string') {
      return (obj.error as any).message;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return 'حدث خطأ غير متوقع';
    }
  }
  return String(value);
}

export function showErrorModal(message: unknown) {
  const safe = safeToString(message) || 'حدث خطأ غير متوقع';
  currentMessage = safe;
  listeners.forEach(fn => fn(safe));
}

export function dismissErrorModal() {
  currentMessage = null;
  listeners.forEach(fn => fn(null));
}

export function ErrorModal() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const listener = (msg: string | null) => setMessage(msg);
    listeners = [...listeners, listener];
    return () => { listeners = listeners.filter(l => l !== listener); };
  }, []);

  return (
    <Modal open={!!message} onClose={dismissErrorModal} title="" size="sm">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-[rgba(239,68,68,0.1)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">حدث خطأ</h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed px-2">{message}</p>
        </div>
        <button
          onClick={dismissErrorModal}
          className="w-full px-4 py-2.5 rounded-xl bg-[var(--red)] text-white font-bold text-sm hover:opacity-90 transition-opacity"
        >
          حسناً
        </button>
      </div>
    </Modal>
  );
}
