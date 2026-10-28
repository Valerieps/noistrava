// The collective-hours challenge (docs/spec/desafio-horas.md): its configuration, period, goal,
// milestones and which activities count. Pure rules, shared by the app and the server.
import { addDays, isCalendarDate, midnightIn, type CalendarDate } from '../time/zones';
import { parseChainConfig, type ChainConfig } from './chain';

export const CHALLENGE_NAME_MAX_LENGTH = 60;
export const GOAL_HOURS_MAX = 10_000;
/** Each hour of activity moves the group 5 km along the journey (ADR-009). */
export const KM_PER_HOUR = 5;
/** After the end, late or edited activities still count for this long; then the result closes. */
export const TOLERANCE_HOURS = 24;
export const PERCENT_MILESTONES = [25, 50, 75] as const;

const PLACE_NAME_MAX_LENGTH = 120;
export const MAX_STOPS = 20;
const MAX_ROUTE_POINTS = 2_000;

/** Collective hours (docs/spec/desafio-horas.md) or the chain (docs/spec/desafio-corrente.md). */
export type ChallengeType = 'horas_colaborativas' | 'corrente';

/** A `draft` is seen only by its creator until she activates it (one `open` at a time). */
export type ChallengeState = 'draft' | 'open' | 'succeeded' | 'failed' | 'cancelled';
export type ChallengeResponse = 'pending' | 'accepted' | 'declined';

export interface Place {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/** A stop on the route; `distanceMeters` is how far along the route it sits. */
export interface JourneyStop extends Place {
  readonly distanceMeters: number;
}

export interface Journey {
  readonly start: Place;
  readonly end: Place;
  readonly stops: readonly JourneyStop[];
  readonly distanceMeters: number;
  /** The simplified route, as [lat, lng] points. */
  readonly route: readonly (readonly [number, number])[];
}

/** What the creator chooses; stored as the challenge's `config`. */
export interface ChallengeConfig {
  readonly startDate: CalendarDate;
  /** The last day, inclusive. */
  readonly endDate: CalendarDate;
  readonly goalMinutes: number;
  readonly journey: Journey | null;
  /** Only in a draft: the journey is chosen but its route is not computed yet, so there is no goal. */
  readonly journeyPending?: true;
  /** Only in a chain, which has no goal in hours (`goalMinutes` is 0) nor journey. */
  readonly chain?: ChainConfig;
}

export interface ChallengeSetup extends ChallengeConfig {
  readonly type: ChallengeType;
  readonly name: string;
}

export function normalizeChallengeName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, ' ');
  return clean.length >= 1 && clean.length <= CHALLENGE_NAME_MAX_LENGTH ? clean : null;
}

/**
 * The period in UTC: it starts at 0h of the first day in the zone furthest ahead and ends at 24h
 * of the last day in the zone furthest behind, so it covers every member's whole days.
 */
export function challengePeriod(startDate: CalendarDate, endDate: CalendarDate, timezones: readonly string[]): { startsAt: Date; endsAt: Date } {
  const zones = timezones.length > 0 ? timezones : ['UTC'];
  const starts = zones.map((zone) => midnightIn(startDate, zone).getTime());
  const ends = zones.map((zone) => midnightIn(addDays(endDate, 1), zone).getTime());
  return { startsAt: new Date(Math.min(...starts)), endsAt: new Date(Math.max(...ends)) };
}

export function journeyGoalMinutes(distanceMeters: number): number {
  return Math.max(1, Math.ceil((distanceMeters / 1000 / KM_PER_HOUR) * 60));
}

/** How far along the route the group is after `totalSeconds` of activity. */
export function journeyProgressMeters(journey: Journey, totalSeconds: number): number {
  return Math.min(journey.distanceMeters, (totalSeconds / 3600) * KM_PER_HOUR * 1000);
}

export function goalReached(totalSeconds: number, goalMinutes: number): boolean {
  return totalSeconds >= goalMinutes * 60;
}

/** Percent of the goal, rounded down, never above 100. */
export function percentOfGoal(totalSeconds: number, goalMinutes: number): number {
  if (goalMinutes <= 0) return 0;
  return Math.min(100, Math.floor((totalSeconds / (goalMinutes * 60)) * 100));
}

export function closesAt(endedAt: Date): Date {
  return new Date(endedAt.getTime() + TOLERANCE_HOURS * 60 * 60 * 1000);
}

/** The milestones: 25%, 50% and 75% of the goal, and each stop of the journey. */
export function milestones(config: ChallengeConfig): { readonly key: string; readonly atSeconds: number }[] {
  // A chain has no goal in hours, so no milestones.
  if (config.chain) return [];
  const goalSeconds = config.goalMinutes * 60;
  const percents = PERCENT_MILESTONES.map((p) => ({ key: `${p}%`, atSeconds: (goalSeconds * p) / 100 }));
  const stops = (config.journey?.stops ?? []).map((stop) => ({
    key: `parada:${stop.name}`,
    atSeconds: (stop.distanceMeters / 1000 / KM_PER_HOUR) * 3600,
  }));
  return [...percents, ...stops];
}

export function reachedMilestones(config: ChallengeConfig, totalSeconds: number): string[] {
  return milestones(config)
    .filter((m) => totalSeconds >= m.atSeconds)
    .map((m) => m.key);
}

/** A member's part in a challenge: her answer and the times she was out after having joined. */
export interface Participation {
  readonly response: ChallengeResponse;
  readonly absences: readonly { readonly leftAt: string; readonly returnedAt: string | null }[];
}

/**
 * Whether an activity started at `startedAt` (ISO, UTC) counts for this member. It counts when she
 * is or was a Senhora, it started inside the counting window, and not while she was out of the
 * challenge. Accepting late counts from the start; activities while she was out never count.
 */
export function activityCounts(startedAt: string, window: { startsAt: string; endsAt: string }, participation: Participation): boolean {
  const everSenhora = participation.response === 'accepted' || participation.absences.length > 0;
  if (!everSenhora) return false;
  if (startedAt < window.startsAt || startedAt >= window.endsAt) return false;
  return !participation.absences.some((a) => startedAt >= a.leftAt && (a.returnedAt === null || startedAt < a.returnedAt));
}

/** Validates what the creator sends to create or edit a challenge. */
export function parseChallengeSetup(input: {
  type?: unknown;
  name?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  goalHours?: unknown;
  journey?: unknown;
  chain?: unknown;
}): ChallengeSetup | null {
  if (typeof input.name !== 'string' || typeof input.startDate !== 'string' || typeof input.endDate !== 'string') return null;
  const name = normalizeChallengeName(input.name);
  if (!name || !isCalendarDate(input.startDate) || !isCalendarDate(input.endDate) || input.endDate < input.startDate) return null;
  const type = input.type ?? 'horas_colaborativas';

  if (type === 'corrente') {
    const chain = parseChainConfig(input.chain, input.startDate, input.endDate);
    if (!chain) return null;
    return { type, name, startDate: input.startDate, endDate: input.endDate, goalMinutes: 0, journey: null, chain };
  }
  if (type !== 'horas_colaborativas') return null;
  if (input.journey !== undefined && input.journey !== null) {
    const journey = parseJourney(input.journey);
    if (!journey) return null;
    return { type, name, startDate: input.startDate, endDate: input.endDate, goalMinutes: journeyGoalMinutes(journey.distanceMeters), journey };
  }
  const hours = input.goalHours;
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > GOAL_HOURS_MAX) return null;
  return { type, name, startDate: input.startDate, endDate: input.endDate, goalMinutes: hours * 60, journey: null };
}

/**
 * Validates a draft: the same format as a challenge, except that a journey may wait for its route
 * (`journeyPending`), with no goal until then.
 */
export function parseDraftSetup(input: Parameters<typeof parseChallengeSetup>[0] & { journeyPending?: unknown }): ChallengeSetup | null {
  if (input.journeyPending !== true || input.type === 'corrente') return parseChallengeSetup(input);
  const setup = parseChallengeSetup({ ...input, journey: null, goalHours: 1 });
  return setup && { ...setup, goalMinutes: 0, journeyPending: true };
}

function parsePlace(value: unknown): Place | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, lat, lng } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !isCoordinate(lat, 90) || !isCoordinate(lng, 180)) return null;
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 1 || clean.length > PLACE_NAME_MAX_LENGTH) return null;
  return { name: clean, lat, lng };
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

export function parseJourney(value: unknown): Journey | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const start = parsePlace(raw.start);
  const end = parsePlace(raw.end);
  const distance = raw.distanceMeters;
  if (!start || !end || typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) return null;

  if (!Array.isArray(raw.stops) || raw.stops.length > MAX_STOPS) return null;
  const stops: JourneyStop[] = [];
  for (const item of raw.stops as unknown[]) {
    const place = parsePlace(item);
    const along = (item as Record<string, unknown>).distanceMeters;
    if (!place || typeof along !== 'number' || !(along > 0 && along < distance)) return null;
    stops.push({ ...place, distanceMeters: along });
  }
  if (new Set(stops.map((s) => s.name)).size !== stops.length) return null;
  stops.sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (!Array.isArray(raw.route) || raw.route.length < 2 || raw.route.length > MAX_ROUTE_POINTS) return null;
  const route: [number, number][] = [];
  for (const point of raw.route as unknown[]) {
    if (!Array.isArray(point) || point.length !== 2 || !isCoordinate(point[0], 90) || !isCoordinate(point[1], 180)) return null;
    route.push([point[0], point[1]]);
  }
  return { start, end, stops, distanceMeters: distance, route };
}
