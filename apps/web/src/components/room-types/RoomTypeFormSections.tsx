'use client';

import { Button } from '@/components/ui';

interface ExtraBed { id?: string; bedType: string; label: string; labelAr: string; price: number; maxCount: number }
interface DefaultService { id?: string; serviceId: string; isFree: boolean; service?: { id: string; name: string; nameAr?: string; price: number } }

interface Props {
  amenityServiceIds: string[];
  extraBeds: ExtraBed[];
  defaultServices: DefaultService[];
  allServices: any[];
  onToggleAmenity: (svcId: string) => void;
  onRemoveAmenity: (svcId: string) => void;
  onAddExtraBed: () => void;
  onUpdateExtraBed: (idx: number, field: string, value: any) => void;
  onRemoveExtraBed: (idx: number) => void;
  onToggleDefaultService: (svcId: string) => void;
}

export function RoomTypeFormSections({
  amenityServiceIds, extraBeds, defaultServices, allServices,
  onToggleAmenity, onRemoveAmenity,
  onAddExtraBed, onUpdateExtraBed, onRemoveExtraBed, onToggleDefaultService,
}: Props) {
  function getServiceName(svc: any) { return svc.nameAr || svc.name; }
  const amenityServices = allServices.filter(s => amenityServiceIds.includes(s.id));

  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
          المزايا (اختر من الخدمات المتاحة)
        </label>
        {amenityServices.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {amenityServices.map(s => (
              <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-[var(--gold)]/10 border border-[var(--gold)] px-2 py-1 rounded-lg">
                {getServiceName(s)}
                <button type="button" onClick={() => onRemoveAmenity(s.id)} className="text-[var(--red)]">&times;</button>
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
          {allServices.map(svc => {
            const isAmenity = amenityServiceIds.includes(svc.id);
            const isDefaultSvc = defaultServices.some(s => s.serviceId === svc.id);
            return (
              <button key={svc.id} type="button" onClick={() => onToggleAmenity(svc.id)}
                className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs border transition-all ${isAmenity ? 'bg-[var(--gold)]/10 border-[var(--gold)] text-[var(--gold)]' : isDefaultSvc ? 'bg-[var(--blue)]/5 border-[var(--blue)]/30 text-[var(--text-secondary)]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]'}`}>
                <span>{getServiceName(svc)}</span>
                <span className="text-[10px]">{svc.price.toFixed(2)} د.ل</span>
              </button>
            );
          })}
        </div>
        {allServices.length === 0 && <p className="text-xs text-[var(--text-muted)]">لا توجد خدمات. أضف خدمات أولاً.</p>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--text-secondary)]">أسرة إضافية</label>
          <Button type="button" variant="secondary" size="sm" onClick={onAddExtraBed}>+ سرير</Button>
        </div>
        {extraBeds.map((bed, i) => (
          <div key={i} className="flex items-center gap-2 mb-2 bg-[var(--bg-primary)] p-2 rounded-lg">
            <select value={bed.bedType} onChange={(e) => onUpdateExtraBed(i, 'bedType', e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none">
              <option value="ADULT">بالغ</option>
              <option value="CHILD">طفل</option>
            </select>
            <input value={bed.labelAr} onChange={(e) => onUpdateExtraBed(i, 'labelAr', e.target.value)} placeholder="تسمية (عربي)" className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs focus:outline-none" />
            <input value={bed.label} onChange={(e) => onUpdateExtraBed(i, 'label', e.target.value)} placeholder="تسمية (إنجليزي)" className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs focus:outline-none" />
            <input type="number" value={bed.price} onChange={(e) => onUpdateExtraBed(i, 'price', parseFloat(e.target.value) || 0)} placeholder="السعر" className="w-20 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs focus:outline-none" />
            <input type="number" value={bed.maxCount} onChange={(e) => onUpdateExtraBed(i, 'maxCount', parseInt(e.target.value) || 1)} placeholder="الحد الأقصى" className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs focus:outline-none" />
            <button type="button" onClick={() => onRemoveExtraBed(i)} className="text-[var(--red)] text-xs">&times;</button>
          </div>
        ))}
        {extraBeds.length === 0 && <p className="text-xs text-[var(--text-muted)]">لم يتم إضافة أسرة إضافية. يمكن إضافة سرير للكبار أو الأطفال.</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">الخدمات الافتراضية (تأتي مجاناً مع هذا النوع)</label>
        <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
          {allServices.map(svc => {
            const selected = defaultServices.find(s => s.serviceId === svc.id);
            const isAmenity = amenityServiceIds.includes(svc.id);
            return (
              <button key={svc.id} type="button" onClick={() => onToggleDefaultService(svc.id)}
                className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs border transition-all ${selected ? 'bg-[var(--gold)]/10 border-[var(--gold)] text-[var(--gold)]' : isAmenity ? 'bg-[var(--green)]/5 border-[var(--green)]/30 text-[var(--text-secondary)]' : 'bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)]'}`}>
                <span>{getServiceName(svc)}</span>
                {selected && <span className="text-[10px]">{selected.isFree ? 'مجاني' : `${svc.price} د.ل`}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
