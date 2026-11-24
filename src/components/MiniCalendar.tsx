import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalDateString } from '../utils/icsExport';

interface MiniCalendarProps {
  selectedDate: Date;
  eventDateKeys: Set<string>;
  onSelectDate: (date: Date) => void;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function MiniCalendar({
  selectedDate,
  eventDateKeys,
  onSelectDate,
}: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState<Date>(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const todayKey = useMemo(() => toLocalDateString(new Date()), []);
  const selectedKey = toLocalDateString(selectedDate);

  const monthTitle = viewMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const gridDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = firstDayOfMonth.getDay();
    const startDate = new Date(year, month, 1 - startOffset);

    const days: { date: Date; key: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const current = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + i,
      );
      days.push({
        date: current,
        key: toLocalDateString(current),
        inMonth: current.getMonth() === month,
      });
    }
    return days;
  }, [viewMonth]);

  const shiftMonth = (delta: number) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return (
    <section aria-label="Mini month navigator" className="select-none">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
          {monthTitle}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((day) => (
          <div
            key={day}
            className="text-[11px] font-medium text-slate-400 dark:text-slate-500 py-1"
          >
            {day}
          </div>
        ))}

        {gridDays.map(({ date, key, inMonth }) => {
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const hasEvent = eventDateKeys.has(key);

          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onSelectDate(date);
                if (!inMonth) {
                  setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                }
              }}
              className={`relative h-7 w-7 mx-auto flex flex-col items-center justify-center rounded-md text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                isSelected
                  ? 'bg-indigo-600 text-white font-semibold'
                  : isToday
                    ? 'bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950/80 dark:text-indigo-300'
                    : inMonth
                      ? 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800'
                      : 'text-slate-400 hover:bg-slate-200/50 dark:text-slate-600 dark:hover:bg-slate-800/60'
              }`}
            >
              <span>{date.getDate()}</span>
              {hasEvent && !isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-500 dark:bg-indigo-400"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
