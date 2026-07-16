type ToastType = 'success' | 'error' | 'info';
type ToastListener = (toasts: Toast[]) => void;

export interface Toast { id: string; type: ToastType; message: string; duration?: number }

let toasts: Toast[] = [];
let listeners: ToastListener[] = [];

function notify() { listeners.forEach(fn => fn([...toasts])); }

export function addToast(type: ToastType, message: string, duration = 4000) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, type, message, duration }];
  notify();
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
}

export function removeToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notify();
}

export function subscribeToasts(listener: ToastListener) {
  listeners = [...listeners, listener];
  return () => { listeners = listeners.filter(l => l !== listener); };
}

export function getToasts() { return [...toasts]; }
