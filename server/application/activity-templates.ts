// Activity templates (docs/spec/atividades.md): each member's own, to log a repeated activity by
// hand with a pick. Nobody else sees them, and they change no challenge.
import type { ActivityTemplateView } from '../../src/application/api-contract';
import { MAX_TEMPLATES, parseActivityTemplate } from '../../src/domain/activity-template';
import type { Weekday } from '../../src/domain/reminder';
import { failure, nowIso, type CommandResult, type Context } from './context';
import type { Member } from './members';

interface TemplateRow {
  id: string;
  member_id: string;
  name: string;
  sport: string;
  duration_seconds: number;
  days: string;
  time: string;
}

const CHANGED = ['templates'] as const;

function toView(row: TemplateRow): ActivityTemplateView {
  return {
    id: row.id,
    name: row.name,
    sport: row.sport,
    durationSeconds: row.duration_seconds,
    days: JSON.parse(row.days) as Weekday[],
    time: row.time,
  };
}

function findOwn(ctx: Context, actor: Member, templateId: unknown): TemplateRow | null {
  if (typeof templateId !== 'string') return null;
  const [row] = ctx.sql.all<TemplateRow>('SELECT * FROM activity_templates WHERE id = ? AND member_id = ?', templateId, actor.id);
  return row ?? null;
}

export function listMyTemplates(ctx: Context, actor: Member): ActivityTemplateView[] {
  return ctx.sql
    .all<TemplateRow>('SELECT * FROM activity_templates WHERE member_id = ? ORDER BY name COLLATE NOCASE, created_at', actor.id)
    .map(toView);
}

export function createTemplate(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ActivityTemplateView> {
  const fields = parseActivityTemplate(input);
  if (!fields) return failure('invalid');
  const [{ count }] = ctx.sql.all<{ count: number }>('SELECT COUNT(*) AS count FROM activity_templates WHERE member_id = ?', actor.id);
  if (count >= MAX_TEMPLATES) return failure('conflict');
  const id = ctx.ids.next();
  ctx.sql.run(
    `INSERT INTO activity_templates (id, member_id, name, sport, duration_seconds, days, time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    actor.id,
    fields.name,
    fields.sport,
    fields.durationSeconds,
    JSON.stringify(fields.days),
    fields.time,
    nowIso(ctx),
  );
  return { ok: true, value: { id, ...fields }, changed: CHANGED };
}

export function updateTemplate(ctx: Context, actor: Member, input: Record<string, unknown>): CommandResult<ActivityTemplateView> {
  const row = findOwn(ctx, actor, input.templateId);
  if (!row) return failure('not_found');
  const fields = parseActivityTemplate(input);
  if (!fields) return failure('invalid');
  ctx.sql.run(
    'UPDATE activity_templates SET name = ?, sport = ?, duration_seconds = ?, days = ?, time = ? WHERE id = ?',
    fields.name,
    fields.sport,
    fields.durationSeconds,
    JSON.stringify(fields.days),
    fields.time,
    row.id,
  );
  return { ok: true, value: { id: row.id, ...fields }, changed: CHANGED };
}

export function deleteTemplate(ctx: Context, actor: Member, input: { templateId?: unknown }): CommandResult<null> {
  const row = findOwn(ctx, actor, input.templateId);
  if (!row) return failure('not_found');
  ctx.sql.run('DELETE FROM activity_templates WHERE id = ?', row.id);
  return { ok: true, value: null, changed: CHANGED };
}

/** When a member leaves the group, her templates go too. */
export function eraseMemberTemplates(ctx: Context, memberId: string): void {
  ctx.sql.run('DELETE FROM activity_templates WHERE member_id = ?', memberId);
}
