// Calendar dates and time zones (docs/spec/desafio-horas.md, "Período e fusos"). Uses only Intl,
// which both the browser and the Worker provide.

/** A calendar date, `YYYY-MM-DD`. */
export type CalendarDate = string;

export function isValidTimezone(timeZone: string): boolean {
  if (timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** How far `timeZone` is ahead of UTC at the instant `utcMs`, in milliseconds. */
function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant `date` begins (0h) in `timeZone`. */
export function midnightIn(date: CalendarDate, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const local = Date.UTC(year, month - 1, day);
  // Twice: the offset at the guess may differ from the offset at the answer (daylight saving).
  const guess = local - offsetMs(local, timeZone);
  return new Date(local - offsetMs(guess, timeZone));
}
