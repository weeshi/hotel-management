'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { getMonthGrid, parseISODate, todayISO, isDateInRange } from '@/lib/utils/calendar';

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const WEEKDAYS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

interface BookingCalendarProps {
  checkIn: string;
  checkOut: string;
  onChange: (range: { checkIn: string; checkOut: string }) => void;
}

export function BookingCalendar({ checkIn, checkOut, onChange }: BookingCalendarProps) {
  const today = todayISO();
  const initial = checkIn ? parseISODate(checkIn) : parseISODate(today);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const todayDate = parseISODate(today);
  const canGoPrev =
    viewYear > todayDate.getFullYear() ||
    (viewYear === todayDate.getFullYear() && viewMonth > todayDate.getMonth());

  const weeks = getMonthGrid(viewYear, viewMonth);

  function handleDayClick(day: string) {
    if (day < today) return;
    if (!checkIn) {
      onChange({ checkIn: day, checkOut: '' });
      return;
    }
    if (checkIn && !checkOut) {
      if (day < checkIn) onChange({ checkIn: day, checkOut: '' });
      else onChange({ checkIn, checkOut: day });
      return;
    }
    onChange({ checkIn: day, checkOut: '' });
  }

  function changeMonth(delta: number) {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    setViewMonth(month);
    setViewYear(year);
  }

  return (
    <div data-component="BookingCalendar" className="select-none">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          disabled={!canGoPrev}
          className="px-3 py-1 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="الشهر السابق"
        >
          ‹
        </button>
        <div className="text-base font-bold text-[var(--text-primary)]">
          {MONTHS_AR[viewMonth]} {viewYear}
        </div>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="px-3 py-1 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors"
          aria-label="الشهر التالي"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS_AR.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-[var(--text-muted)]">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;

          const disabled = day < today;
          const isStart = day === checkIn;
          const isEnd = day === checkOut;
          const inRange = !isStart && !isEnd && isDateInRange(day, checkIn, checkOut);

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => handleDayClick(day)}
              className={clsx(
                'h-9 rounded-lg text-sm font-medium transition-colors',
                disabled && 'text-[var(--text-muted)] opacity-30 cursor-not-allowed',
                !disabled && !isStart && !isEnd && !inRange && 'text-[var(--text-primary)] hover:bg-[var(--bg-primary)]',
                inRange && 'bg-[rgba(201,168,76,0.15)] text-[var(--text-primary)]',
                (isStart || isEnd) && 'bg-[var(--gold)] text-black font-bold'
              )}
            >
              {parseInt(day.slice(8), 10)}
            </button>
          );
        })}
      </div>

      {checkIn && !checkOut && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          حدد تاريخ المغادرة (بعد {parseISODate(checkIn).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })})
        </p>
      )}
      {checkIn && checkOut && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          الإقامة:{' '}
          <span className="font-bold text-[var(--gold)]">
            {Math.round((parseISODate(checkOut).getTime() - parseISODate(checkIn).getTime()) / 86400000)}
          </span>{' '}
          ليلة
        </p>
      )}
    </div>
  );
}
