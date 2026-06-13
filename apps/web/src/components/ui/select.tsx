'use client';

import { clsx } from 'clsx';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, error, options, placeholder, className, id, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <select
        id={id}
        className={clsx(
          'w-full px-4 py-2.5 rounded-xl bg-[var(--bg-card)] border text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)] transition-colors appearance-none',
          error ? 'border-[var(--red)]' : 'border-[var(--border)]',
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-[var(--red)]">{error}</p>
      )}
    </div>
  );
}
