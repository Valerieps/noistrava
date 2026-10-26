// Dates, numbers and names as the screens show them, in Brazilian Portuguese.
import { strings } from '../domain/strings';

const LOCALE = 'pt-BR';

export function sportName(sport: string): string {
  return strings.sports[sport] ?? strings.otherSport;
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** "1 a 31 de outubro", "28 de set. a 4 de out.", from calendar dates. */
export function formatPeriod(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const month = (m: number, y: number) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(LOCALE, { month: 'long', timeZone: 'UTC' });
  if (sy === ey && sm === em) return `${sd} a ${ed} de ${month(em, ey)}`;
  if (sy === ey) return `${sd} de ${month(sm, sy)} a ${ed} de ${month(em, ey)}`;
  return `${sd}/${sm}/${sy} a ${ed}/${em}/${ey}`;
}

/** "12 de outubro", from a `YYYY-MM-DD` date. */
export function formatDayMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "12 de outubro", from an instant, in the viewer's zone. */
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
}

/** "12 de out., 18h", in the viewer's zone. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}, ${formatHour(date, undefined)}`;
}

/** "set 2026". */
export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' }).replace(' de ', ' ').replace('.', '');
}

/** "7h12", "19h", in `timeZone` (the viewer's when undefined). */
export function formatHour(date: Date, timeZone: string | undefined): string {
  const parts = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return minute === '00' ? `${hour}h` : `${hour}h${minute}`;
}

/** "seg 0h", in `timeZone`. */
export function formatWeekdayHour(date: Date, timeZone: string): string {
  const weekday = date.toLocaleDateString(LOCALE, { weekday: 'short', timeZone }).replace('.', '');
  return `${weekday} ${formatHour(date, timeZone)}`;
}

/** "hoje, 7h12", "ontem, 19h", "12 de out., 7h": an activity's start, in its own zone. */
export function formatWhen(startedAt: string, timeZone: string, now: Date): string {
  const date = new Date(startedAt);
  const day = (d: Date) => {
    try {
      return d.toLocaleDateString('en-CA', { timeZone });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };
  const hour = safeHour(date, timeZone);
  if (day(date) === day(now)) return `${strings.challenge.log.today}, ${hour}`;
  if (day(date) === day(new Date(now.getTime() - 86_400_000))) return `${strings.challenge.log.yesterday}, ${hour}`;
  return `${date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', timeZone })}, ${hour}`;
}

function safeHour(date: Date, timeZone: string): string {
  try {
    return formatHour(date, timeZone);
  } catch {
    return formatHour(date, undefined);
  }
}

/** "393 km", "2,5 km". */
export function formatKm(km: number): string {
  const rounded = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${rounded.toLocaleString(LOCALE)} km`;
}

export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** `YYYY-MM-DD` of today in the viewer's zone. */
export function todayDate(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** The value of a `datetime-local` input for an instant, in the viewer's zone. */
export function toLocalInput(iso: string | Date): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
