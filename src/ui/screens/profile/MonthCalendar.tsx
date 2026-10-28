// The month calendar of my active days (docs/spec/acompanhamento.md, "O meu ritmo"): four tones by
// time, today with a ring, the days still to come dashed, and arrows back to the months I was active.
import { useState } from 'react';
import type { DayTotal } from '../../../domain/tracking/tracking';
import { dayLevel, weekday } from '../../../domain/tracking/tracking';
import { formatDuration } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { formatDayMonth, formatMonth } from '../../format';
import { ChevronIcon } from '../../icons';

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function MonthCalendar({ days, today }: { days: readonly DayTotal[]; today: string }) {
  const t = strings.tracking;
  const current = today.slice(0, 7);
  const first = days[0]?.date.slice(0, 7) ?? current;
  const [month, setMonth] = useState(current);
  const seconds = new Map(days.map((d) => [d.date, d.seconds]));

  const dates = Array.from({ length: daysIn(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const active = dates.filter((d) => seconds.has(d)).length;
  const title = formatMonth(month, Number(today.slice(0, 4)));

  return (
    <section className="sheet-section month-calendar" aria-label={t.calendarLabel}>
      <div className="month-calendar-head">
        <button type="button" className="icon-button flip" aria-label={t.previousMonth} disabled={month <= first} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronIcon />
        </button>
        <div className="center">
          <h2 className="d month-calendar-title">{title}</h2>
          <div className="small muted">{t.activeDays(active)}</div>
        </div>
        <button type="button" className="icon-button" aria-label={t.nextMonth} disabled={month >= current} onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronIcon />
        </button>
      </div>
      <div className="month-grid" aria-hidden="true">
        {t.weekdayInitials.map((initial, i) => (
          <span key={i} className="month-weekday">
            {initial}
          </span>
        ))}
      </div>
      <ol className="month-grid">
        {dates.map((date, i) => {
          const time = seconds.get(date);
          const future = date > today;
          const classes = ['month-day', future ? 'future' : `level-${dayLevel(time ?? 0)}`, date === today ? 'today' : ''].join(' ');
          return (
            <li
              key={date}
              className={classes}
              style={i === 0 ? { gridColumnStart: weekday(date) + 1 } : undefined}
              aria-label={t.dayLabel(formatDayMonth(date), time ? formatDuration(time) : null)}
              aria-current={date === today ? 'date' : undefined}
            />
          );
        })}
      </ol>
      <div className="month-legend" aria-hidden="true">
        {t.less}
        {[0, 1, 2, 3].map((level) => (
          <span key={level} className={`month-swatch level-${level}`} />
        ))}
        {t.more}
      </div>
    </section>
  );
}
