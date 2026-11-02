// The reminder to log the activities (docs/spec/notificacoes.md): on which weekdays, at what time
// in the member's own zone, and whether it is due now.
import type { CalendarDate } from './time/zones';

/** Weekdays as the app shows them: 0 is Monday, 6 is Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ReminderSettings {
  readonly enabled: boolean;
  /** Sorted, no repeats. */
  readonly days: readonly Weekday[];
  /** `HH:MM`, 24 hours, in the member's zone. */
  readonly time: string;
}

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], time: '20:00' };

/** After the chosen time, how long the reminder may still go out (the cron may skip a run). */
export const REMINDER_WINDOW_MINUTES = 60;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseReminderSettings(input: { enabled?: unknown; days?: unknown; time?: unknown }): ReminderSettings | null {
  if (typeof input.enabled !== 'boolean' || !Array.isArray(input.days) || typeof input.time !== 'string') return null;
  if (!TIME.test(input.time)) return null;
  if (!input.days.every((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const days = [...new Set(input.days)].sort((a, b) => a - b);
  return { enabled: input.enabled, days, time: input.time };
}

/** The date, weekday and minute of the day at `now` in `timeZone`. */
export function localMoment(now: Date, timeZone: string): { date: CalendarDate; weekday: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const [year, month, day] = date.split('-').map(Number);
  // getUTCDay: 0 is Sunday; the app's weeks start on Monday.
  const weekday = ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) as Weekday;
  return { date, weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * The local date to record when the reminder is due now, else null. Due once a day, on a chosen
 * weekday, from the chosen time until REMINDER_WINDOW_MINUTES later.
 */
export function reminderDue(settings: ReminderSettings, timeZone: string, now: Date, lastSentOn: CalendarDate | null): CalendarDate | null {
  if (!settings.enabled) return null;
  const local = localMoment(now, timeZone);
  if (!settings.days.includes(local.weekday) || lastSentOn === local.date) return null;
  const [hour, minute] = settings.time.split(':').map(Number);
  const late = local.minutes - (hour * 60 + minute);
  return late >= 0 && late < REMINDER_WINDOW_MINUTES ? local.date : null;
}

/** A push subscription's address must belong to one of the known push services. */
export function isPushEndpoint(endpoint: unknown, origins: readonly string[]): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && origins.includes(url.origin);
  } catch {
    return false;
  }
}
