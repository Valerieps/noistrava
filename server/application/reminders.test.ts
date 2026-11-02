import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock, memorySql, sequentialIds } from '../testing/node-sql';
import { GroupService } from './group-service';
import type { GoogleProfile } from './members';

const profile = (email: string, name = email.split('@')[0]): GoogleProfile => ({ sub: `sub:${email}`, email, name, picture: null });
const ADMIN = 'ana@example.com';
const PHONE = 'https://fcm.googleapis.com/fcm/send/phone';
const LAPTOP = 'https://updates.push.services.mozilla.com/wpush/v2/laptop';

let clock: ReturnType<typeof fixedClock>;
let service: GroupService;
let ana: string;
let bia: string;

beforeEach(() => {
  // Monday 2026-11-02, 19:00 in Lisbon.
  clock = fixedClock('2026-11-02T19:00:00Z');
  service = new GroupService(memorySql(), clock, sequentialIds());
  service.migrate();
  service.signIn(profile(ADMIN, 'Ana'), 'h-ana', [ADMIN]);
  service.command('h-ana', 'invite.create', { email: 'bia@example.com' });
  service.signIn(profile('bia@example.com', 'Bia'), 'h-bia', []);
  ana = 'h-ana';
  bia = 'h-bia';
  service.command(ana, 'member.setTimezone', { timezone: 'Europe/Lisbon' });
  service.command(bia, 'member.setTimezone', { timezone: 'America/Sao_Paulo' });
});

const turnOn = (hash: string, time = '20:00', days = [0, 1, 2, 3, 4]) => service.command(hash, 'reminder.set', { enabled: true, days, time });

describe('reminder settings', () => {
  it('starts off, every day at 20:00, on no device', () => {
    expect(service.query(ana, 'reminder', {})).toEqual({ ok: true, value: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], time: '20:00', devices: 0 } });
  });

  it('keeps each member her own days and time', () => {
    expect(turnOn(ana, '07:15', [5, 6])).toMatchObject({ ok: true, value: { enabled: true, days: [5, 6], time: '07:15' }, changed: ['reminder'] });
    expect(service.query(bia, 'reminder', {})).toMatchObject({ value: { enabled: false } });
  });

  it('refuses invalid settings', () => {
    expect(service.command(ana, 'reminder.set', { enabled: true, days: [0], time: '25:00' })).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('devices', () => {
  it('accepts only the push services of the network policy', () => {
    expect(service.command(ana, 'push.subscribe', { endpoint: PHONE })).toMatchObject({ ok: true, value: { devices: 1 } });
    expect(service.command(ana, 'push.subscribe', { endpoint: 'https://evil.example/x' })).toEqual({ ok: false, error: 'invalid' });
  });

  it('gives a shared device to whoever subscribed it last', () => {
    service.command(ana, 'push.subscribe', { endpoint: PHONE });
    service.command(bia, 'push.subscribe', { endpoint: PHONE });
    expect(service.query(ana, 'reminder', {})).toMatchObject({ value: { devices: 0 } });
    expect(service.query(bia, 'reminder', {})).toMatchObject({ value: { devices: 1 } });
  });

  it('lets a member unsubscribe only her own device', () => {
    service.command(ana, 'push.subscribe', { endpoint: PHONE });
    service.command(bia, 'push.unsubscribe', { endpoint: PHONE });
    expect(service.query(ana, 'reminder', {})).toMatchObject({ value: { devices: 1 } });
    service.command(ana, 'push.unsubscribe', { endpoint: PHONE });
    expect(service.query(ana, 'reminder', {})).toMatchObject({ value: { devices: 0 } });
  });
});

describe('remindersDue', () => {
  beforeEach(() => {
    turnOn(ana);
    service.command(ana, 'push.subscribe', { endpoint: PHONE });
    service.command(ana, 'push.subscribe', { endpoint: LAPTOP });
  });

  it('sends to every device at the member time in her zone, once a day', () => {
    expect(service.remindersDue()).toEqual([]);
    clock.set('2026-11-02T20:05:00Z');
    expect(service.remindersDue().sort()).toEqual([PHONE, LAPTOP].sort());
    expect(service.remindersDue()).toEqual([]);
    clock.set('2026-11-03T20:00:00Z');
    expect(service.remindersDue()).toHaveLength(2);
  });

  it('waits for the other member own zone', () => {
    turnOn(bia);
    service.command(bia, 'push.subscribe', { endpoint: 'https://web.push.apple.com/bia' });
    clock.set('2026-11-02T20:05:00Z');
    expect(service.remindersDue()).not.toContain('https://web.push.apple.com/bia');
    clock.set('2026-11-02T23:05:00Z');
    expect(service.remindersDue()).toEqual(['https://web.push.apple.com/bia']);
  });

  it('sends nothing when turned off, and forgets a device that is gone', () => {
    service.removePushSubscription(LAPTOP);
    clock.set('2026-11-02T20:05:00Z');
    expect(service.remindersDue()).toEqual([PHONE]);
    service.command(ana, 'reminder.set', { enabled: false, days: [0], time: '20:00' });
    clock.set('2026-11-03T20:05:00Z');
    expect(service.remindersDue()).toEqual([]);
  });

  it('stops for a member removed from the group', () => {
    turnOn(bia);
    service.command(bia, 'push.subscribe', { endpoint: 'https://web.push.apple.com/bia' });
    const biaId = (service.query(bia, 'me', {}) as { value: { id: string } }).value.id;
    service.command(ana, 'member.remove', { memberId: biaId });
    clock.set('2026-11-02T23:05:00Z');
    expect(service.remindersDue()).toEqual([]);
  });
});

describe('window reminder', () => {
  const P256DH = `B${'a'.repeat(86)}`;
  const AUTH = 'b'.repeat(22);
  const turnOnWindow = (hash: string, time = '12:00') => service.command(hash, 'windowReminder.set', { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], time });
  const logDay = (hash: string, date: string) =>
    expect(service.command(hash, 'activity.create', { startedAt: `${date}T08:00:00Z`, timezone: 'UTC', durationSeconds: 1800, sport: 'Run' })).toMatchObject({ ok: true });

  beforeEach(() => {
    // Ana moved every day of October up to the 30th, so 2 November is her window's last day.
    clock.set('2026-11-01T10:00:00Z');
    for (let day = 1; day <= 30; day++) logDay(ana, `2026-10-${String(day).padStart(2, '0')}`);
    clock.set('2026-11-02T12:05:00Z');
  });

  it('starts off, every day at 12:00, apart from the reminder to log', () => {
    expect(service.query(ana, 'windowReminder', {})).toEqual({ ok: true, value: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], time: '12:00', devices: 0 } });
    turnOnWindow(ana, '09:00');
    expect(service.query(ana, 'reminder', {})).toMatchObject({ value: { enabled: false, time: '20:00' } });
  });

  it('on the window last day, sends the index either way to the devices with keys, once', () => {
    turnOnWindow(ana);
    service.command(ana, 'push.subscribe', { endpoint: PHONE, p256dh: P256DH, auth: AUTH });
    service.command(ana, 'push.subscribe', { endpoint: LAPTOP });
    expect(service.query(ana, 'windowReminder', {})).toMatchObject({ value: { devices: 1 } });
    const [message, ...rest] = service.windowRemindersDue();
    expect(rest).toEqual([]);
    expect(message).toMatchObject({ endpoint: PHONE, keys: { p256dh: P256DH, auth: AUTH } });
    expect(JSON.parse(message.payload)).toEqual({
      title: 'Sua janela fecha hoje ⏳',
      body: 'Um exercício hoje e o seu Índice de Aproveitamento fica em 100%. Sem ele, cai para 90%. Bora manter a janela aberta? 💪',
      tag: 'janela',
    });
    expect(service.windowRemindersDue()).toEqual([]);
  });

  it('sends nothing once she moved today, nor on another day', () => {
    turnOnWindow(ana);
    service.command(ana, 'push.subscribe', { endpoint: PHONE, p256dh: P256DH, auth: AUTH });
    logDay(ana, '2026-11-02');
    expect(service.windowRemindersDue()).toEqual([]);
    clock.set('2026-11-03T12:05:00Z');
    expect(service.windowRemindersDue()).toEqual([]);
  });

  it('waits for a chosen day and time', () => {
    service.command(ana, 'windowReminder.set', { enabled: true, days: [1], time: '12:00' });
    service.command(ana, 'push.subscribe', { endpoint: PHONE, p256dh: P256DH, auth: AUTH });
    expect(service.windowRemindersDue()).toEqual([]);
  });

  it('refuses bad keys, and refreshes keys only on a device already mine', () => {
    expect(service.command(ana, 'push.subscribe', { endpoint: PHONE, p256dh: 'x', auth: AUTH })).toEqual({ ok: false, error: 'invalid' });
    service.command(ana, 'push.subscribe', { endpoint: PHONE });
    expect(service.command(bia, 'push.refreshKeys', { endpoint: PHONE, p256dh: P256DH, auth: AUTH })).toMatchObject({ ok: true, changed: [] });
    expect(service.query(ana, 'windowReminder', {})).toMatchObject({ value: { devices: 0 } });
    expect(service.command(ana, 'push.refreshKeys', { endpoint: PHONE, p256dh: P256DH, auth: AUTH })).toMatchObject({ ok: true, changed: ['reminder'] });
    expect(service.query(ana, 'windowReminder', {})).toMatchObject({ value: { devices: 1 } });
    // Subscribing again without keys keeps the ones it had.
    service.command(ana, 'push.subscribe', { endpoint: PHONE });
    expect(service.query(ana, 'windowReminder', {})).toMatchObject({ value: { devices: 1 } });
  });
});
