'use client';

import { useRef, useState } from 'react';

export interface UseOtpInputOptions {
  length?: number;
  onComplete?: (code: string) => void;
}

/**
 * Lightweight, dependency-free 6-box OTP input controller (SA.5).
 *
 * Covers the mobile-grade UX requirements without pulling in a third-party
 * component: numeric filtering, automatic focus advance, Backspace walk-back,
 * arrow-key navigation, and full-code paste. Auto-submits the moment the box is
 * full so the agent never has to hunt for the confirm button.
 */
export function useOtpInput({ length = 6, onComplete }: UseOtpInputOptions = {}) {
  const [values, setValues] = useState<string[]>(() => Array(length).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const registerRef = (index: number) => (el: HTMLInputElement | null) => {
    refs.current[index] = el;
  };

  const setValueAt = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setValues((prev) => {
      const next = [...prev];
      next[index] = digit;
      if (digit && next.every((v) => v !== '') && onComplete) {
        // Deferred so the focused input paints the last digit before submit.
        setTimeout(() => onComplete(next.join('')), 0);
      }
      return next;
    });
    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!values[index] && index > 0) refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight') {
      if (index < length - 1) {
        e.preventDefault();
        refs.current[index + 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      if (index > 0) {
        e.preventDefault();
        refs.current[index - 1]?.focus();
      }
    } else if (!/^\d$/.test(e.key) && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!digits) return;

    setValues(() => {
      const next = Array<string>(length).fill('');
      digits.split('').forEach((d, i) => {
        next[i] = d;
      });
      if (digits.length === length && onComplete) {
        setTimeout(() => onComplete(digits), 0);
      }
      return next;
    });
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  };

  const reset = () => setValues(Array(length).fill(''));

  return { values, setValueAt, onKeyDown, onPaste, registerRef, reset };
}