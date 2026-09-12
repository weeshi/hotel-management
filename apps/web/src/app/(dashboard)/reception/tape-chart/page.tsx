'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button, Input } from '@/components/ui';
import { apiGet } from '@/lib/utils/api-client';
import { TapeChart, DailyRoomGrid } from '@/components/tape-chart';
import type { TapeChartData } from '@/components/tape-chart/types';

type ViewMode = 'tape-chart' | 'daily-grid';

function generateDateRange(from: Date, days: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function TapeChartPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('tape-chart');
  const [fromDate, setFromDate] = useState(formatDateInput(today));
  const [gridDate, setGridDate] = useState(formatDateInput(today));
  const [rangeDays, setRangeDays] = useState(14);
  const [data, setData] = useState<TapeChartData | null>(null);
  const [loading, setLoading] = useState(true);

  const dateColumns = useMemo(() => {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    return generateDateRange(from, rangeDays);
  }, [fromDate, rangeDays]);

  async function fetchData() {
    setLoading(true);
    try {
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + rangeDays);
      const res = await apiGet(
        `/api/admin/tape-chart?from=${fromDate}&to=${formatDateInput(toDate)}`
      );
      if (res.success) setData(res.data || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [fromDate, rangeDays]);

  async function fetchGridDay() {
    setLoading(true);
    try {
      const gridDay = new Date(gridDate);
      const nextDay = new Date(gridDay);
      nextDay.setDate(nextDay.getDate() + 1);
      const res = await apiGet(
        `/api/admin/tape-chart?from=${gridDate}&to=${formatDateInput(nextDay)}`
      );
      if (res.success) setData(res.data || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (viewMode === 'daily-grid') fetchGridDay();
  }, [viewMode, gridDate]);

  return (
    <div data-component="TapeChartPage">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📅 المخطط الزمني للغرف</h1>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={fetchData}>تحديث</Button>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex gap-2 flex-wrap items-end mb-4">
        <button
          onClick={() => setViewMode('tape-chart')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'tape-chart'
              ? 'bg-[var(--gold)] text-black'
              : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
          }`}
        >
          📊 المخطط الزمني
        </button>
        <button
          onClick={() => setViewMode('daily-grid')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'daily-grid'
              ? 'bg-[var(--gold)] text-black'
              : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]'
          }`}
        >
          🏠 عرض الغرف اليومي
        </button>
        {viewMode === 'tape-chart' && (
          <>
            <Input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-36"
            />
            <select
              value={rangeDays}
              onChange={e => setRangeDays(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs"
            >
              <option value={7}>7 أيام</option>
              <option value={14}>14 يوم</option>
              <option value={30}>30 يوم</option>
              <option value={60}>60 يوم</option>
            </select>
          </>
        )}
        {viewMode === 'daily-grid' && (
          <Input
            type="date"
            value={gridDate}
            onChange={e => setGridDate(e.target.value)}
            className="w-36"
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[rgba(46,204,113,0.25)] border border-[var(--green)]" /> مقيم
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[rgba(52,152,219,0.2)] border border-[var(--blue)]" /> مؤكد
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-[var(--green)]" /> متاحة
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-[var(--yellow)]" /> غير نظيفة
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-[var(--red)]" /> صيانة
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-[var(--gold)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : data ? (
        viewMode === 'tape-chart' ? (
          <TapeChart data={data} dateColumns={dateColumns} onRefresh={fetchData} />
        ) : (
          <DailyRoomGrid rooms={data.rooms} bookingRooms={data.bookingRooms} selectedDate={gridDate} />
        )
      ) : null}
    </div>
  );
}
