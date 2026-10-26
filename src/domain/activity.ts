// An activity (docs/spec/atividades.md): start, time zone, total time and sport. It belongs to the
// member, never to a challenge. Shared by the app and the server.
import { isValidTimezone } from './time/zones';

export type ActivitySource = 'manual' | 'strava';

/** No minimum; a day is the most one activity can last. */
export const MAX_DURATION_SECONDS = 24 * 60 * 60;

/** The sports a member picks when logging by hand; the keys are Strava's `sport_type` names. */
export const MANUAL_SPORTS = [
  'Run',
  'Walk',
  'Hike',
  'Ride',
  'Swim',
  'WeightTraining',
  'Workout',
  'HighIntensityIntervalTraining',
  'Crossfit',
  'Yoga',
  'Pilates',
  'Elliptical',
  'StairStepper',
  'Rowing',
  'Soccer',
  'Tennis',
  'Surfing',
  'RockClimbing',
] as const;

export interface ActivityFields {
  /** ISO 8601, UTC. */
  readonly startedAt: string;
  readonly timezone: string;
  readonly durationSeconds: number;
  readonly sport: string;
}

/** Strava sends many more sport types than the manual list; accept any plain name. */
export function isValidSport(sport: string, source: ActivitySource): boolean {
  return source === 'manual' ? (MANUAL_SPORTS as readonly string[]).includes(sport) : /^[A-Za-z]{1,40}$/.test(sport);
}

export function isValidDuration(seconds: unknown): seconds is number {
  return typeof seconds === 'number' && Number.isInteger(seconds) && seconds > 0 && seconds <= MAX_DURATION_SECONDS;
}

/**
 * Validates an activity and puts its start in canonical UTC form. A manual activity cannot start
 * in the future.
 */
export function parseActivity(input: Record<string, unknown>, source: ActivitySource, now: Date): ActivityFields | null {
  const { startedAt, timezone, durationSeconds, sport } = input;
  if (typeof startedAt !== 'string' || typeof timezone !== 'string' || typeof sport !== 'string') return null;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime()) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(startedAt)) return null;
  if (source === 'manual' && start.getTime() > now.getTime()) return null;
  if (!isValidTimezone(timezone) || !isValidDuration(durationSeconds) || !isValidSport(sport, source)) return null;
  return { startedAt: start.toISOString(), timezone, durationSeconds, sport };
}
