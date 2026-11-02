// The reminder to log the activities (docs/spec/notificacoes.md, ADR-012): each member's days and
// time, the devices that receive it, and which devices are due a push now. The Worker sends them.
import { PUSH_ORIGINS } from '../../network-policy';
import type { ReminderView } from '../../src/application/api-contract';
import { DEFAULT_REMINDER, isPushEndpoint, parseReminderSettings, reminderDue, type ReminderSettings, type Weekday } from '../../src/domain/reminder';
import { failure, nowIso, type CommandResult, type Context } from './context';
import type { Member } from './members';

interface ReminderRow {
  member_id: string;
  enabled: number;
  days: string;
  time: string;
  last_sent_on: string | null;
}

function toSettings(row: ReminderRow | undefined): ReminderSettings {
  if (!row) return DEFAULT_REMINDER;
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

export function setReminder(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ReminderView> {
  const settings = parseReminderSettings(input);
  if (!settings) return failure('invalid');
  ctx.sql.run(
    `INSERT INTO reminders (member_id, enabled, days, time) VALUES (?, ?, ?, ?)
     ON CONFLICT (member_id) DO UPDATE SET enabled = excluded.enabled, days = excluded.days, time = excluded.time`,
    actor.id,
    settings.enabled ? 1 : 0,
    JSON.stringify(settings.days),
    settings.time,
  );
  return { ok: true, value: view(ctx, actor.id), changed: ['reminder'] };
}

/** A device shared by two members receives the reminder of whoever subscribed it last. */
export function subscribePush(ctx: Context, actor: Member, input: { endpoint?: unknown }): CommandResult<ReminderView> {
  if (!isPushEndpoint(input.endpoint, PUSH_ORIGINS)) return failure('invalid');
  ctx.sql.run(
    `INSERT INTO push_subscriptions (endpoint, member_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET member_id = excluded.member_id`,
    input.endpoint,
    actor.id,
    nowIso(ctx),
  );
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
