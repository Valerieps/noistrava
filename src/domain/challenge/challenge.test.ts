import { describe, expect, it } from 'vitest';
import { parseActivity } from '../activity';
import { stravaTimezone } from '../strava';
import { addDays, isCalendarDate, isValidTimezone, midnightIn } from '../time/zones';
import {
  activityCounts,
  challengePeriod,
  closesAt,
  journeyGoalMinutes,
  journeyProgressMeters,
  parseChallengeSetup,
  parseDraftSetup,
  parseJourney,
  percentOfGoal,
  reachedMilestones,
  type ChallengeConfig,
} from './challenge';

describe('time zones', () => {
  it('finds midnight in a zone, across daylight saving', () => {
    expect(midnightIn('2026-11-02', 'America/Sao_Paulo').toISOString()).toBe('2026-11-02T03:00:00.000Z');
    expect(midnightIn('2026-07-01', 'Europe/Lisbon').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(midnightIn('2026-12-01', 'Europe/Lisbon').toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('checks dates and zones', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isValidTimezone('America/Phoenix')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });

  it('reads the zone Strava sends', () => {
    expect(stravaTimezone('(GMT-03:00) America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(stravaTimezone('(GMT+00:00) Nowhere')).toBeNull();
  });
});

describe('challenge period', () => {
  it('starts in the zone furthest ahead and ends in the one furthest behind', () => {
    // The spec's example: GMT-3 and GMT-7, Monday 0h to Sunday 24h.
    const period = challengePeriod('2026-11-02', '2026-11-08', ['America/Sao_Paulo', 'America/Phoenix']);
    expect(period.startsAt.toISOString()).toBe('2026-11-02T03:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-11-09T07:00:00.000Z');
  });

  it('uses UTC while no member has a zone', () => {
    const period = challengePeriod('2026-11-02', '2026-11-02', []);
    expect(period.startsAt.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('challenge setup', () => {
  const base = { name: ' Cem   horas ', startDate: '2026-11-02', endDate: '2026-11-08' };

  it('takes a goal in whole hours', () => {
    expect(parseChallengeSetup({ ...base, goalHours: 100 })).toEqual({
      type: 'horas_colaborativas',
      name: 'Cem horas',
      startDate: '2026-11-02',
      endDate: '2026-11-08',
      goalMinutes: 6000,
      journey: null,
    });
    expect(parseChallengeSetup({ ...base, goalHours: 0 })).toBeNull();
    expect(parseChallengeSetup({ ...base, goalHours: 1.5 })).toBeNull();
    expect(parseChallengeSetup({ ...base, endDate: '2026-11-01', goalHours: 10 })).toBeNull();
    expect(parseChallengeSetup({ ...base, name: '', goalHours: 10 })).toBeNull();
  });

  it('turns a journey distance into the goal, at 5 km per hour', () => {
    const journey = {
      start: { name: 'Lisboa', lat: 38.7, lng: -9.1 },
      end: { name: 'Porto', lat: 41.1, lng: -8.6 },
      stops: [{ name: 'Coimbra', lat: 40.2, lng: -8.4, distanceMeters: 200_000 }],
      distanceMeters: 300_000,
      route: [
        [38.7, -9.1],
        [41.1, -8.6],
      ],
    };
    expect(parseChallengeSetup({ ...base, journey })?.goalMinutes).toBe(3600);
    expect(journeyGoalMinutes(1)).toBe(1);
    expect(parseChallengeSetup({ ...base, journey: { ...journey, stops: [{ ...journey.stops[0], distanceMeters: 400_000 }] } })).toBeNull();
  });

  it('lets a draft wait for its route, with no goal until then', () => {
    expect(parseDraftSetup({ ...base, journeyPending: true })).toMatchObject({ goalMinutes: 0, journey: null, journeyPending: true });
    expect(parseDraftSetup({ ...base, journeyPending: true, name: '' })).toBeNull();
    expect(parseDraftSetup({ ...base, goalHours: 10 })).toEqual(parseChallengeSetup({ ...base, goalHours: 10 }));
    expect(percentOfGoal(3600, 0)).toBe(0);
  });

  it('keeps a known banner pattern and refuses any other', () => {
    expect(parseChallengeSetup({ ...base, goalHours: 10, banner: 'dots' })?.banner).toBe('dots');
    expect(parseChallengeSetup({ ...base, goalHours: 10 })).not.toHaveProperty('banner');
    expect(parseChallengeSetup({ ...base, goalHours: 10, banner: 'url(x)' })).toBeNull();
    expect(parseDraftSetup({ ...base, journeyPending: true, banner: 'grid' })?.banner).toBe('grid');
  });
});

describe('progress', () => {
  const config: ChallengeConfig = { startDate: '2026-11-02', endDate: '2026-11-08', goalMinutes: 600, journey: null };

  it('reaches 25%, 50% and 75%', () => {
    expect(reachedMilestones(config, 0)).toEqual([]);
    expect(reachedMilestones(config, 300 * 60)).toEqual(['25%', '50%']);
    expect(percentOfGoal(300 * 60, 600)).toBe(50);
    expect(percentOfGoal(9999 * 60, 600)).toBe(100);
  });

  it('counts a journey stop as a milestone', () => {
    const journey = { start: { name: 'A', lat: 0, lng: 0 }, end: { name: 'B', lat: 1, lng: 1 }, stops: [{ name: 'C', lat: 0, lng: 0, distanceMeters: 5000 }], distanceMeters: 100_000, route: [] };
    expect(reachedMilestones({ ...config, goalMinutes: 1200, journey }, 3600)).toEqual(['parada:C']);
  });
});

describe('which activities count', () => {
  const window = { startsAt: '2026-11-02T03:00:00.000Z', endsAt: '2026-11-09T07:00:00.000Z' };
  const at = (day: number) => `2026-11-0${day}T12:00:00.000Z`;

  it('counts a Senhora inside the period, from the start even if she accepted late', () => {
    expect(activityCounts(at(3), window, { response: 'accepted', absences: [] })).toBe(true);
    expect(activityCounts('2026-11-01T12:00:00.000Z', window, { response: 'accepted', absences: [] })).toBe(false);
    expect(activityCounts(at(3), window, { response: 'pending', absences: [] })).toBe(false);
    expect(activityCounts(at(3), window, { response: 'declined', absences: [] })).toBe(false);
  });

  it('keeps what came before leaving, and skips the time she was out', () => {
    const left = { response: 'declined' as const, absences: [{ leftAt: at(4), returnedAt: null }] };
    expect(activityCounts(at(3), window, left)).toBe(true);
    expect(activityCounts(at(5), window, left)).toBe(false);
    const back = { response: 'accepted' as const, absences: [{ leftAt: at(4), returnedAt: at(6) }] };
    expect(activityCounts(at(5), window, back)).toBe(false);
    expect(activityCounts(at(7), window, back)).toBe(true);
  });
});

describe('activity', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const valid = { startedAt: '2026-11-05T07:00:00-03:00', timezone: 'America/Sao_Paulo', durationSeconds: 1800, sport: 'Run' };

  it('stores the start in UTC', () => {
    expect(parseActivity(valid, 'manual', now)?.startedAt).toBe('2026-11-05T10:00:00.000Z');
  });

  it('refuses the future, no duration, unknown sports and starts without an offset', () => {
    expect(parseActivity({ ...valid, startedAt: '2026-11-06T07:00:00Z' }, 'manual', now)).toBeNull();
    expect(parseActivity({ ...valid, durationSeconds: 0 }, 'manual', now)).toBeNull();
    expect(parseActivity({ ...valid, sport: 'Chess' }, 'manual', now)).toBeNull();
    expect(parseActivity({ ...valid, sport: 'TrailRun' }, 'strava', now)).not.toBeNull();
    expect(parseActivity({ ...valid, startedAt: '2026-11-05T07:00:00' }, 'manual', now)).toBeNull();
  });
});

describe('limits and boundaries', () => {
  const base = { name: 'Semana', startDate: '2026-11-02', endDate: '2026-11-08' };
  const journey = {
    start: { name: 'A', lat: 0, lng: 0 },
    end: { name: 'B', lat: 1, lng: 1 },
    stops: [
      { name: 'D', lat: 0.6, lng: 0.6, distanceMeters: 60_000 },
      { name: 'C', lat: 0.3, lng: 0.3, distanceMeters: 30_000 },
    ],
    distanceMeters: 100_000,
    route: [
      [0, 0],
      [1, 1],
    ],
  };

  it('takes goals from 1 to 10.000 whole hours', () => {
    expect(parseChallengeSetup({ ...base, goalHours: 1 })?.goalMinutes).toBe(60);
    expect(parseChallengeSetup({ ...base, goalHours: 10_000 })?.goalMinutes).toBe(600_000);
    expect(parseChallengeSetup({ ...base, goalHours: 10_001 })).toBeNull();
    expect(parseChallengeSetup({ ...base, goalHours: '10' })).toBeNull();
    expect(parseChallengeSetup({ ...base, goalHours: -1 })).toBeNull();
  });

  it('takes a one-day period and names up to 60 characters', () => {
    expect(parseChallengeSetup({ ...base, endDate: base.startDate, goalHours: 1 })).not.toBeNull();
    expect(parseChallengeSetup({ ...base, name: 'x'.repeat(60), goalHours: 1 })).not.toBeNull();
    expect(parseChallengeSetup({ ...base, name: 'x'.repeat(61), goalHours: 1 })).toBeNull();
    expect(parseChallengeSetup({ ...base, name: '   ', goalHours: 1 })).toBeNull();
    expect(parseChallengeSetup({ ...base, startDate: '2026-02-30', goalHours: 1 })).toBeNull();
  });

  it('orders the stops along the route and refuses broken journeys', () => {
    expect(parseJourney(journey)?.stops.map((s) => s.name)).toEqual(['C', 'D']);
    expect(parseJourney({ ...journey, stops: [] })?.stops).toEqual([]);
    expect(parseJourney({ ...journey, stops: [journey.stops[0], { ...journey.stops[1], name: 'D' }] })).toBeNull();
    expect(parseJourney({ ...journey, stops: Array.from({ length: 21 }, (_, i) => ({ ...journey.stops[0], name: `S${i}`, distanceMeters: 1000 + i })) })).toBeNull();
    expect(parseJourney({ ...journey, route: [[0, 0]] })).toBeNull();
    expect(parseJourney({ ...journey, route: [[91, 0], [0, 0]] })).toBeNull();
    expect(parseJourney({ ...journey, start: { name: 'A', lat: 0, lng: 181 } })).toBeNull();
    expect(parseJourney({ ...journey, distanceMeters: 0 })).toBeNull();
    expect(parseJourney({ ...journey, stops: undefined })).toBeNull();
    // A journey sets the goal; the hours sent along are ignored.
    expect(parseChallengeSetup({ ...base, goalHours: 1, journey })?.goalMinutes).toBe(1200);
  });

  it('moves along the route at 5 km per hour, never past the end', () => {
    const parsed = parseJourney(journey)!;
    expect(journeyProgressMeters(parsed, 3600)).toBe(5000);
    expect(journeyProgressMeters(parsed, 100 * 3600)).toBe(100_000);
  });

  it('rounds the percent down and closes the result 24 hours after the end', () => {
    expect(percentOfGoal(599 * 60, 600)).toBe(99);
    expect(percentOfGoal(0, 600)).toBe(0);
    expect(closesAt(new Date('2026-11-09T00:00:00Z')).toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('counts from the first instant of the period and not from its last', () => {
    const window = { startsAt: '2026-11-02T00:00:00.000Z', endsAt: '2026-11-09T00:00:00.000Z' };
    const senhora = { response: 'accepted' as const, absences: [] };
    expect(activityCounts('2026-11-02T00:00:00.000Z', window, senhora)).toBe(true);
    expect(activityCounts('2026-11-01T23:59:59.999Z', window, senhora)).toBe(false);
    expect(activityCounts('2026-11-09T00:00:00.000Z', window, senhora)).toBe(false);
    const away = { response: 'accepted' as const, absences: [{ leftAt: '2026-11-04T00:00:00.000Z', returnedAt: '2026-11-05T00:00:00.000Z' }] };
    expect(activityCounts('2026-11-04T00:00:00.000Z', window, away)).toBe(false);
    expect(activityCounts('2026-11-05T00:00:00.000Z', window, away)).toBe(true);
  });

  it('lets an activity last up to 24 hours', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    const valid = { startedAt: '2026-11-04T07:00:00Z', timezone: 'UTC', durationSeconds: 86_400, sport: 'Hike' };
    expect(parseActivity(valid, 'manual', now)).not.toBeNull();
    expect(parseActivity({ ...valid, durationSeconds: 86_401 }, 'manual', now)).toBeNull();
    expect(parseActivity({ ...valid, durationSeconds: 1 }, 'manual', now)).not.toBeNull();
    expect(parseActivity({ ...valid, durationSeconds: 90.5 }, 'manual', now)).toBeNull();
    expect(parseActivity({ ...valid, timezone: 'Mars/Olympus' }, 'manual', now)).toBeNull();
    expect(parseActivity({ ...valid, startedAt: 'yesterday' }, 'manual', now)).toBeNull();
    expect(parseActivity({ ...valid, sport: 'Run!' }, 'strava', now)).toBeNull();
  });
});
