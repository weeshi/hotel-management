interface DataCardProps {
  label: string;
  value: string;
  icon: string;
  color?: string;
}

export function DataCard({ label, value, icon, color = 'var(--gold)' }: DataCardProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-center transition-all duration-300 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-gold)]">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
