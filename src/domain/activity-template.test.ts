import { describe, expect, it } from 'vitest';
import { parseActivityTemplate, templateDate } from './activity-template';

const swim = { name: 'Natação', sport: 'Swim', durationSeconds: 3600, days: [2, 0, 2], time: '08:00' };

describe('parseActivityTemplate', () => {
  it('trims the name and sorts the days', () => {
    expect(parseActivityTemplate({ ...swim, name: '  Natação   do  clube ' })).toEqual({
      name: 'Natação do clube',
      sport: 'Swim',
      durationSeconds: 3600,
      days: [0, 2],
      time: '08:00',
    });
  });

  it('accepts no days at all', () => {
    expect(parseActivityTemplate({ ...swim, days: [] })).toMatchObject({ days: [] });
  });

  it('refuses a bad name, sport, time, duration or day', () => {
    expect(parseActivityTemplate({ ...swim, name: '  ' })).toBeNull();
    expect(parseActivityTemplate({ ...swim, name: 'x'.repeat(41) })).toBeNull();
    expect(parseActivityTemplate({ ...swim, sport: 'Teleport' })).toBeNull();
    expect(parseActivityTemplate({ ...swim, time: '8:00' })).toBeNull();
    expect(parseActivityTemplate({ ...swim, durationSeconds: 0 })).toBeNull();
    expect(parseActivityTemplate({ ...swim, days: [7] })).toBeNull();
  });
});

describe('templateDate', () => {
  // Monday 2026-11-02 and Tuesday 2026-11-03, in UTC.
  const mondayAt = (time: string) => new Date(`2026-11-02T${time}:00Z`);
  const tuesdayAt = (time: string) => new Date(`2026-11-03T${time}:00Z`);
  const monWed = { days: [0, 2] as const, time: '08:00' };

  it('is today on one of its weekdays, once its time has come', () => {
    expect(templateDate(monWed, mondayAt('09:30'), 'UTC')).toBe('2026-11-02');
    expect(templateDate(monWed, mondayAt('08:00'), 'UTC')).toBe('2026-11-02');
  });

  it('is the latest of its weekdays on another day', () => {
    expect(templateDate(monWed, tuesdayAt('12:00'), 'UTC')).toBe('2026-11-02');
    expect(templateDate({ days: [2], time: '08:00' }, tuesdayAt('12:00'), 'UTC')).toBe('2026-10-28');
  });

  it('goes back to the previous one when today it has not started yet', () => {
    expect(templateDate(monWed, mondayAt('07:00'), 'UTC')).toBe('2026-10-28');
    expect(templateDate({ days: [0], time: '08:00' }, mondayAt('07:00'), 'UTC')).toBe('2026-10-26');
  });

  it('without weekdays, is today, or yesterday before its time', () => {
    expect(templateDate({ days: [], time: '08:00' }, mondayAt('09:00'), 'UTC')).toBe('2026-11-02');
    expect(templateDate({ days: [], time: '08:00' }, mondayAt('07:00'), 'UTC')).toBe('2026-11-01');
  });

  it('reads today in the member’s zone', () => {
    // Tuesday 01:00 UTC is still Monday 22:00 in São Paulo.
    expect(templateDate(monWed, tuesdayAt('01:00'), 'America/Sao_Paulo')).toBe('2026-11-02');
  });
});
