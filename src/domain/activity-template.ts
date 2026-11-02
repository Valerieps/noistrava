// An activity template (docs/spec/atividades.md): an activity I repeat, saved once with its sport,
// total time, usual weekdays and time, so logging it by hand is a pick and a confirm. Shared by the
// app and the server.
import { isValidDuration, isValidSport } from './activity';
import { localMoment, type Weekday } from './reminder';
import { addDays, type CalendarDate } from './time/zones';

export const MAX_TEMPLATE_NAME_LENGTH = 40;

/** How many templates one member may keep; a guard, not a product limit anyone should reach. */
export const MAX_TEMPLATES = 30;

export interface ActivityTemplateFields {
  readonly name: string;
  readonly sport: string;
  readonly durationSeconds: number;
  /** Sorted, no repeats; empty means any day. */
  readonly days: readonly Weekday[];
  /** `HH:MM`, 24 hours, in the member's zone. */
  readonly time: string;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseActivityTemplate(input: Record<string, unknown>): ActivityTemplateFields | null {
  const { name, sport, durationSeconds, days, time } = input;
  if (typeof name !== 'string' || typeof sport !== 'string' || typeof time !== 'string' || !Array.isArray(days)) return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > MAX_TEMPLATE_NAME_LENGTH) return null;
  if (!isValidSport(sport, 'manual') || !isValidDuration(durationSeconds) || !TIME.test(time)) return null;
  if (!days.every((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  return { name: trimmed, sport, durationSeconds, days: [...new Set(days)].sort((a, b) => a - b), time };
}

/**
 * The local date to prefill when I pick a template: the latest of its weekdays up to today, and
 * today only once its time has come (a manual activity cannot start in the future). On a template
 * without weekdays, today, else yesterday.
 */
export function templateDate(template: Pick<ActivityTemplateFields, 'days' | 'time'>, now: Date, timeZone: string): CalendarDate {
  const local = localMoment(now, timeZone);
  const [hour, minute] = template.time.split(':').map(Number);
  const startsLaterToday = hour * 60 + minute > local.minutes;
  for (let back = startsLaterToday ? 1 : 0; back <= 7; back++) {
    const weekday = ((local.weekday - back + 7) % 7) as Weekday;
    if (template.days.length === 0 || template.days.includes(weekday)) return addDays(local.date, -back);
  }
  return local.date;
}
