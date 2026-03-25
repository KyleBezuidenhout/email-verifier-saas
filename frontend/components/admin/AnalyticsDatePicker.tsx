"use client";

import { useState, useRef, useEffect, useMemo } from "react";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  label: string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 1 Week", days: 7 },
  { label: "Last 2 Weeks", days: 14 },
  { label: "Current Month", days: -1 },
  { label: "Last 1 Month", days: 30 },
  { label: "Last 3 Months", days: 90 },
  { label: "All Time", days: -2 },
] as const;

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function buildPresetRange(preset: (typeof PRESETS)[number]): DateRange {
  const now = new Date();
  const today = formatDate(now);

  if (preset.days === 0) {
    return { startDate: today, endDate: today, label: preset.label };
  }
  if (preset.days === -1) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: formatDate(start), endDate: today, label: preset.label };
  }
  if (preset.days === -2) {
    return { startDate: "2024-01-01", endDate: today, label: preset.label };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - preset.days);
  return { startDate: formatDate(start), endDate: today, label: preset.label };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AnalyticsDatePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(value.label);
  const [customStart, setCustomStart] = useState(value.startDate);
  const [customEnd, setCustomEnd] = useState(value.endDate);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [pickingStart, setPickingStart] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isCustom = activePreset === "Custom";

  const daysInMonth = useMemo(() => {
    return new Date(calYear, calMonth + 1, 0).getDate();
  }, [calMonth, calYear]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(calYear, calMonth, 1).getDay();
  }, [calMonth, calYear]);

  function handlePresetClick(preset: (typeof PRESETS)[number]) {
    const range = buildPresetRange(preset);
    setActivePreset(preset.label);
    setCustomStart(range.startDate);
    setCustomEnd(range.endDate);
  }

  function handleDayClick(day: number) {
    const d = formatDate(new Date(calYear, calMonth, day));
    if (pickingStart) {
      setCustomStart(d);
      if (d > customEnd) setCustomEnd(d);
      setPickingStart(false);
    } else {
      if (d < customStart) {
        setCustomStart(d);
      } else {
        setCustomEnd(d);
      }
      setPickingStart(true);
    }
    setActivePreset("Custom");
  }

  function handleApply() {
    onChange({ startDate: customStart, endDate: customEnd, label: activePreset });
    setOpen(false);
  }

  function isInRange(day: number) {
    const d = formatDate(new Date(calYear, calMonth, day));
    return d >= customStart && d <= customEnd;
  }

  function isToday(day: number) {
    const d = formatDate(new Date(calYear, calMonth, day));
    return d === formatDate(new Date());
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashboard-border bg-dashboard-surface text-sm text-dashboard-text hover:border-dashboard-accent/40 transition-all"
      >
        <svg className="w-4 h-4 text-dashboard-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {value.label}
        <svg className={`w-3 h-3 text-dashboard-text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 glass-card shadow-2xl flex" style={{ minWidth: 520 }}>
          {/* Presets */}
          <div className="border-r border-dashboard-border p-3 flex flex-col gap-1 min-w-[160px]">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePresetClick(p)}
                className={`text-left text-sm px-3 py-2 rounded-md transition-all ${
                  activePreset === p.label
                    ? "bg-dashboard-accent/15 text-dashboard-accent font-medium"
                    : "text-dashboard-text-muted hover:text-dashboard-text hover:bg-dashboard-card"
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="border-t border-dashboard-border my-1" />
            <button
              onClick={() => { setActivePreset("Custom"); setPickingStart(true); }}
              className={`text-left text-sm px-3 py-2 rounded-md transition-all ${
                isCustom
                  ? "bg-dashboard-accent/15 text-dashboard-accent font-medium"
                  : "text-dashboard-text-muted hover:text-dashboard-text hover:bg-dashboard-card"
              }`}
            >
              Custom
            </button>
          </div>

          {/* Calendar */}
          <div className="p-4 flex flex-col flex-1">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-dashboard-card text-dashboard-text-muted hover:text-dashboard-text transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={calMonth}
                  onChange={(e) => setCalMonth(Number(e.target.value))}
                  className="bg-transparent text-sm text-dashboard-text border-none focus:outline-none cursor-pointer"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i} className="bg-dashboard-surface">{m}</option>
                  ))}
                </select>
                <select
                  value={calYear}
                  onChange={(e) => setCalYear(Number(e.target.value))}
                  className="bg-transparent text-sm text-dashboard-text border-none focus:outline-none cursor-pointer"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                    <option key={y} value={y} className="bg-dashboard-surface">{y}</option>
                  ))}
                </select>
              </div>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-dashboard-card text-dashboard-text-muted hover:text-dashboard-text transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0 mb-1">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-xs text-dashboard-text-muted py-1 font-medium">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-0">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-8" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const inRange = isInRange(day);
                const today = isToday(day);
                const d = formatDate(new Date(calYear, calMonth, day));
                const isStart = d === customStart;
                const isEnd = d === customEnd;

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`h-8 text-sm rounded-md transition-all relative ${
                      isStart || isEnd
                        ? "bg-dashboard-accent text-white font-medium"
                        : inRange
                        ? "bg-dashboard-accent/20 text-dashboard-accent"
                        : "text-dashboard-text hover:bg-dashboard-card"
                    } ${today && !isStart && !isEnd ? "ring-1 ring-dashboard-accent/50" : ""}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-dashboard-border">
              <span className="text-xs text-dashboard-text-muted">
                {customStart} &mdash; {customEnd}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-sm text-dashboard-text-muted hover:text-dashboard-text rounded-md hover:bg-dashboard-card transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="px-4 py-1.5 text-sm bg-dashboard-accent text-white rounded-md hover:bg-dashboard-accent/90 transition-all"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
