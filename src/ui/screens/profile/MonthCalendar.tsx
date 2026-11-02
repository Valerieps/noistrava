// The month calendar of my window of benefits (docs/spec/acompanhamento.md, "O meu ritmo"): active
// days with their sport, days kept by a short pause, days lost in a long one, today with a ring, the
// days still to come dashed, the month's Índice de Aproveitamento, and arrows back to the months I
// was active.
import { useState } from 'react';
import type { DayTotal } from '../../../domain/tracking/tracking';
import { visibleMonth, weekday } from '../../../domain/tracking/tracking';
import { indexZone, monthIndex, windowStates, type WindowState } from '../../../domain/tracking/window-index';
import { formatDuration } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { formatDayMonth, formatMonth } from '../../format';
import { ChevronIcon, SeveralSportsIcon, SportIcon } from '../../icons';

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const LEGEND: readonly WindowState[] = ['active', 'kept', 'lost'];

export function MonthCalendar({ days, today }: { days: readonly DayTotal[]; today: string }) {
  const t = strings.tracking;
  const current = today.slice(0, 7);
  const first = days[0]?.date.slice(0, 7) ?? current;
  const [picked, setPicked] = useState<{ from: string; month: string } | null>(null);
  const month = visibleMonth(picked, current);
  const setMonth = (next: string) => setPicked({ from: current, month: next });
  const byDate = new Map(days.map((d) => [d.date, d]));
  const states = windowStates(
    days.map((d) => d.date),
    today,
  );

  const dates = Array.from({ length: daysIn(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const active = dates.filter((d) => byDate.has(d)).length;
  const index = monthIndex(states, month);
  const title = formatMonth(month, Number(today.slice(0, 4)));

  return (
    <section className="sheet-section month-calendar" aria-label={t.calendarLabel}>
      <div className="month-calendar-head">
        <button type="button" className="icon-button flip" aria-label={t.previousMonth} disabled={month <= first} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronIcon />
        </button>
        <div className="center">
          <h2 className="d month-calendar-title">{title}</h2>
          <div className="small muted">{active ? t.activeDays(active) : t.emptyMonth}</div>
          {index !== null && (
            <div className="small month-index">
              {t.monthIndex}: <strong className={`index-percent-inline ${indexZone(index)}`}>{index}%</strong>
            </div>
          )}
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
          const day = byDate.get(date);
          const future = date > today;
          const state = future ? undefined : states.get(date);
          const classes = ['month-day', future ? 'future' : state ? `window-${state}` : '', date === today ? 'today' : ''].join(' ');
          return (
            <li
              key={date}
              className={classes}
              style={i === 0 ? { gridColumnStart: weekday(date) + 1 } : undefined}
              aria-label={t.dayLabel(formatDayMonth(date), day ? formatDuration(day.seconds) : null, state ? t.windowStates[state] : null)}
              aria-current={date === today ? 'date' : undefined}
            >
              {state === 'active' && day && (day.sports.length > 1 ? <SeveralSportsIcon /> : <SportIcon sport={day.sports[0]} />)}
            </li>
          );
        })}
      </ol>
      <div className="month-legend" aria-hidden="true">
        {LEGEND.map((state) => (
          <span key={state} className="month-legend-item">
            <span className={`month-swatch window-${state}`} />
            {t.windowStates[state]}
          </span>
        ))}
      </div>
    </section>
  );
}
