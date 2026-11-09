// The reminders (docs/spec/notificacoes.md, ADR-012, ADR-013): to log the activities, and that the
// window of benefits closes today. Each member's days and time, the devices that receive them, and
// which devices are due a push now. The Worker sends them.
import { PUSH_ORIGINS } from '../../network-policy';
import type { ReminderView } from '../../src/application/api-contract';
import {
  DEFAULT_REMINDER,
  DEFAULT_WINDOW_REMINDER,
  isPushEndpoint,
  isPushKeys,
  parseReminderSettings,
  reminderDue,
  type PushKeys,
  type ReminderSettings,
  type Weekday,
} from '../../src/domain/reminder';
import { strings } from '../../src/domain/strings';
import { closingWindow } from '../../src/domain/tracking/window-index';
import { failure, nowIso, type CommandResult, type Context } from './context';
import type { Member } from './members';
import { activeDaysOf } from './tracking';

/** A push with content, for a device that gave its keys to encrypt it with. */
export interface PushMessage {
  readonly endpoint: string;
  readonly keys: PushKeys;
  /** JSON: `{title, body, tag}`, what public/sw.js shows. */
  readonly payload: string;
}

interface ReminderRow {
  member_id: string;
  enabled: number;
  days: string;
  time: string;
  last_sent_on: string | null;
}

function toSettings(row: ReminderRow | undefined, defaults = DEFAULT_REMINDER): ReminderSettings {
  if (!row) return defaults;
  return { enabled: row.enabled === 1, days: JSON.parse(row.days) as Weekday[], time: row.time };
}

function view(ctx: Context, memberId: string): ReminderView {
  const [row] = ctx.sql.all<ReminderRow>('SELECT * FROM reminders WHERE member_id = ?', memberId);
  const [{ devices }] = ctx.sql.all<{ devices: number }>('SELECT COUNT(*) AS devices FROM push_subscriptions WHERE member_id = ?', memberId);
  return { ...toSettings(row), devices };
}

export function reminder(ctx: Context, actor: Member): ReminderView {
  return view(ctx, actor.id);
}

/** The window reminder reaches only the devices that gave their keys, since its push has content. */
function windowView(ctx: Context, memberId: string): ReminderView {
  const [row] = ctx.sql.all<ReminderRow>('SELECT * FROM window_reminders WHERE member_id = ?', memberId);
  const [{ devices }] = ctx.sql.all<{ devices: number }>(
    'SELECT COUNT(*) AS devices FROM push_subscriptions WHERE member_id = ? AND p256dh IS NOT NULL',
    memberId,
  );
  return { ...toSettings(row, DEFAULT_WINDOW_REMINDER), devices };
}

export function windowReminder(ctx: Context, actor: Member): ReminderView {
  return windowView(ctx, actor.id);
}

export function setWindowReminder(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ReminderView> {
  const settings = parseReminderSettings(input);
  if (!settings) return failure('invalid');
  saveSettings(ctx, 'window_reminders', actor.id, settings);
  return { ok: true, value: windowView(ctx, actor.id), changed: ['reminder'] };
}

function saveSettings(ctx: Context, table: 'reminders' | 'window_reminders', memberId: string, settings: ReminderSettings): void {
  ctx.sql.run(
    `INSERT INTO ${table} (member_id, enabled, days, time) VALUES (?, ?, ?, ?)
     ON CONFLICT (member_id) DO UPDATE SET enabled = excluded.enabled, days = excluded.days, time = excluded.time`,
    memberId,
    settings.enabled ? 1 : 0,
    JSON.stringify(settings.days),
    settings.time,
  );
}

export function setReminder(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ReminderView> {
  const settings = parseReminderSettings(input);
  if (!settings) return failure('invalid');
  saveSettings(ctx, 'reminders', actor.id, settings);
  return { ok: true, value: view(ctx, actor.id), changed: ['reminder'] };
}

/** A device shared by two members receives the reminder of whoever subscribed it last. */
export function subscribePush(ctx: Context, actor: Member, input: { endpoint?: unknown; p256dh?: unknown; auth?: unknown }): CommandResult<ReminderView> {
  if (!isPushEndpoint(input.endpoint, PUSH_ORIGINS)) return failure('invalid');
  const keys = isPushKeys(input) ? input : null;
  if (!keys && (input.p256dh !== undefined || input.auth !== undefined)) return failure('invalid');
  ctx.sql.run(
    `INSERT INTO push_subscriptions (endpoint, member_id, created_at, p256dh, auth) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET member_id = excluded.member_id,
       p256dh = COALESCE(excluded.p256dh, p256dh), auth = COALESCE(excluded.auth, auth)`,
    input.endpoint,
    actor.id,
    nowIso(ctx),
    keys?.p256dh ?? null,
    keys?.auth ?? null,
  );
  return { ok: true, value: view(ctx, actor.id), changed: ['reminder'] };
}

/**
 * The keys of a device already mine, for one subscribed before the window reminder existed. Unlike
 * subscribing, it never takes a device another member subscribed last.
 */
export function refreshPushKeys(ctx: Context, actor: Member, input: { endpoint?: unknown; p256dh?: unknown; auth?: unknown }): CommandResult<ReminderView> {
  const endpoint = input.endpoint;
  if (typeof endpoint !== 'string' || !isPushKeys(input)) return failure('invalid');
  const [row] = ctx.sql.all<{ p256dh: string | null; auth: string | null }>(
    'SELECT p256dh, auth FROM push_subscriptions WHERE endpoint = ? AND member_id = ?',
    endpoint,
    actor.id,
  );
  if (!row || (row.p256dh === input.p256dh && row.auth === input.auth)) return { ok: true, value: view(ctx, actor.id), changed: [] };
  ctx.sql.run('UPDATE push_subscriptions SET p256dh = ?, auth = ? WHERE endpoint = ?', input.p256dh, input.auth, endpoint);
  return { ok: true, value: view(ctx, actor.id), changed: ['reminder'] };
}

export function unsubscribePush(ctx: Context, actor: Member, input: { endpoint?: unknown }): CommandResult<ReminderView> {
  if (typeof input.endpoint !== 'string') return failure('invalid');
  ctx.sql.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?', input.endpoint, actor.id);
  return { ok: true, value: view(ctx, actor.id), changed: ['reminder'] };
}

/** A push service said the device is gone (it unsubscribed, or the app was removed). */
export function removePushSubscription(ctx: Context, endpoint: string): void {
  ctx.sql.run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
}

/** Leaving the group stops the reminder on every device. */
export function eraseMemberReminder(ctx: Context, memberId: string): void {
  ctx.sql.run('DELETE FROM push_subscriptions WHERE member_id = ?', memberId);
  ctx.sql.run('DELETE FROM reminders WHERE member_id = ?', memberId);
  ctx.sql.run('DELETE FROM window_reminders WHERE member_id = ?', memberId);
  ctx.sql.run('DELETE FROM season_notice_settings WHERE member_id = ?', memberId);
}

/**
 * The devices due a reminder now. Marks each member's reminder as sent for her local date before
 * the Worker sends it, so a failed push is not repeated every five minutes.
 */
export function remindersDue(ctx: Context): string[] {
  const now = ctx.clock.now();
  const rows = ctx.sql.all<ReminderRow & { timezone: string | null }>(
    `SELECT r.*, m.timezone FROM reminders r JOIN members m ON m.id = r.member_id
     WHERE r.enabled = 1 AND m.active = 1
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.member_id = r.member_id)`,
  );
  return ctx.sql.transaction(() =>
    rows.flatMap((row) => {
      const due = reminderDue(toSettings(row), row.timezone ?? 'UTC', now, row.last_sent_on);
      if (!due) return [];
      ctx.sql.run('UPDATE reminders SET last_sent_on = ? WHERE member_id = ?', due, row.member_id);
      return ctx.sql.all<{ endpoint: string }>('SELECT endpoint FROM push_subscriptions WHERE member_id = ?', row.member_id).map((p) => p.endpoint);
    }),
  );
}

/**
 * The window reminders due now: on a chosen day and time, when today is the last day the member's
 * window can be kept. Marks the day as checked first, whether or not the window closes, as above.
 */
export function windowRemindersDue(ctx: Context): PushMessage[] {
  const now = ctx.clock.now();
  const rows = ctx.sql.all<ReminderRow & { timezone: string | null }>(
    `SELECT r.*, m.timezone FROM window_reminders r JOIN members m ON m.id = r.member_id
     WHERE r.enabled = 1 AND m.active = 1
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.member_id = r.member_id AND p.p256dh IS NOT NULL)`,
  );
  return ctx.sql.transaction(() =>
    rows.flatMap((row) => {
      const today = reminderDue(toSettings(row, DEFAULT_WINDOW_REMINDER), row.timezone ?? 'UTC', now, row.last_sent_on);
      if (!today) return [];
      ctx.sql.run('UPDATE window_reminders SET last_sent_on = ? WHERE member_id = ?', today, row.member_id);
      const closing = closingWindow(activeDaysOf(ctx, row.member_id), today);
      if (!closing) return [];
      const s = strings.windowReminder;
      const rises = closing.before === null || closing.ifActive > closing.before;
      const payload = JSON.stringify({ title: s.notificationTitle, body: s.notificationBody(closing.ifActive, closing.ifNot, rises), tag: 'janela' });
      return ctx.sql
        .all<{ endpoint: string; p256dh: string; auth: string }>(
          'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ? AND p256dh IS NOT NULL',
          row.member_id,
        )
        .map((p) => ({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth }, payload }));
    }),
  );
}
