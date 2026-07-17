'use client';

interface Props {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}

export function PeriodSelector({ value, options, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {options.map(p => (
        <button key={p.value} onClick={() => onChange(p.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${value === p.value ? 'bg-[var(--gold)] text-black' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
