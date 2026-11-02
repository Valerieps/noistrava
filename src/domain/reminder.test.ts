import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER, isPushEndpoint, localMoment, parseReminderSettings, reminderDue, type ReminderSettings } from './reminder';

const weekdays: ReminderSettings = { enabled: true, days: [0, 1, 2, 3, 4], time: '20:00' };

describe('parseReminderSettings', () => {
  it('sorts the days and drops repeats', () => {
    expect(parseReminderSettings({ enabled: true, days: [4, 0, 4], time: '07:30' })).toEqual({ enabled: true, days: [0, 4], time: '07:30' });
  });

  it('refuses a bad time or day', () => {
    expect(parseReminderSettings({ enabled: true, days: [0], time: '24:00' })).toBeNull();
    expect(parseReminderSettings({ enabled: true, days: [0], time: '7:30' })).toBeNull();
    expect(parseReminderSettings({ enabled: true, days: [7], time: '07:30' })).toBeNull();
    expect(parseReminderSettings({ enabled: 'yes', days: [], time: '07:30' })).toBeNull();
  });

  it('accepts no days at all', () => {
    expect(parseReminderSettings({ ...DEFAULT_REMINDER, days: [] })).toMatchObject({ days: [] });
  });
});

describe('localMoment', () => {
  it('reads the date, weekday and minutes in the zone', () => {
    // Monday 2026-11-02 01:30 UTC is Sunday 22:30 in São Paulo.
    expect(localMoment(new Date('2026-11-02T01:30:00Z'), 'America/Sao_Paulo')).toEqual({ date: '2026-11-01', weekday: 6, minutes: 22 * 60 + 30 });
    expect(localMoment(new Date('2026-11-02T01:30:00Z'), 'UTC')).toEqual({ date: '2026-11-02', weekday: 0, minutes: 90 });
  });
});

describe('reminderDue', () => {
  // Monday 2026-11-02, 20:00 in Lisbon (UTC+0 in November).
  const at = (iso: string) => new Date(iso);

  it('is due from the time until the window closes, on a chosen day', () => {
    expect(reminderDue(weekdays, 'Europe/Lisbon', at('2026-11-02T19:59:00Z'), null)).toBeNull();
    expect(reminderDue(weekdays, 'Europe/Lisbon', at('2026-11-02T20:00:00Z'), null)).toBe('2026-11-02');
    expect(reminderDue(weekdays, 'Europe/Lisbon', at('2026-11-02T20:59:00Z'), null)).toBe('2026-11-02');
    expect(reminderDue(weekdays, 'Europe/Lisbon', at('2026-11-02T21:00:00Z'), null)).toBeNull();
  });

  it('goes out once a day', () => {
    expect(reminderDue(weekdays, 'Europe/Lisbon', at('2026-11-02T20:05:00Z'), '2026-11-02')).toBeNull();
    expect(reminderDue(weekdays, 'Europe/Lisbon', at('2026-11-03T20:05:00Z'), '2026-11-02')).toBe('2026-11-03');
  });

  it('skips the days not chosen and a reminder turned off', () => {
    // Saturday 2026-11-07.
    expect(reminderDue(weekdays, 'Europe/Lisbon', at('2026-11-07T20:05:00Z'), null)).toBeNull();
    expect(reminderDue({ ...weekdays, enabled: false }, 'Europe/Lisbon', at('2026-11-02T20:05:00Z'), null)).toBeNull();
  });

  it('uses the member zone', () => {
    // 20:00 in São Paulo is 23:00 UTC.
    expect(reminderDue(weekdays, 'America/Sao_Paulo', at('2026-11-02T20:05:00Z'), null)).toBeNull();
    expect(reminderDue(weekdays, 'America/Sao_Paulo', at('2026-11-02T23:05:00Z'), null)).toBe('2026-11-02');
  });
});

describe('isPushEndpoint', () => {
  const origins = ['https://fcm.googleapis.com'];

  it('accepts only https addresses of the known push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc', origins)).toBe(true);
    expect(isPushEndpoint('https://evil.example/fcm/send/abc', origins)).toBe(false);
    expect(isPushEndpoint('http://fcm.googleapis.com/x', origins)).toBe(false);
    expect(isPushEndpoint('not a url', origins)).toBe(false);
    expect(isPushEndpoint(42, origins)).toBe(false);
  });
});
