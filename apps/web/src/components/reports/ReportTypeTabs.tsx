'use client';

const reportTypes = [
  { value: 'occupancy', label: '🛏️ الإشغال' },
  { value: 'revenue', label: '💰 الإيرادات' },
  { value: 'wallet', label: '👛 المحفظة' },
  { value: 'housekeeping', label: '🧹 التدبير المنزلي' },
  { value: 'restaurant', label: '🍽️ المطعم' },
  { value: 'safe-deposit', label: '🔐 صناديق الأمانات' },
  { value: 'lost-found', label: '📦 المفقودات' },
];

export function ReportTypeTabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {reportTypes.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            value === t.value
              ? 'bg-[var(--gold)] text-black'
              : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
          }`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
