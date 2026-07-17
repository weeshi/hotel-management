'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';

export default function CalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  }

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div data-component="ReceptionCalendarPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📅 التقويم</h1>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={prevMonth}>←</Button>
          <h2 className="text-lg font-bold">
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <Button variant="ghost" onClick={nextMonth}>→</Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((d) => (
            <div key={d} className="text-xs text-[var(--text-muted)] font-semibold py-2">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
            return (
              <div
                key={day}
                className={`py-2 rounded-lg text-sm transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)] ${
                  isToday ? 'bg-[rgba(201,168,76,0.15)] text-[var(--gold)] font-bold' : ''
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
