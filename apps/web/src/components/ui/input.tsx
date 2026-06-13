'use client';

import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <input
        id={id}
        className={clsx(
          'w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors',
          error ? 'border-[var(--red)]' : 'border-[var(--border)]',
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-[var(--red)]">{error}</p>
      )}
    </div>
  );
}
