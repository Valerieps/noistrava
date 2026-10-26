// Invites (docs/spec/acesso-e-membros.md): admins only, tied to an e-mail, never expire.
import type { InviteState, InviteView } from '../../src/application/api-contract';
import { isPlausibleEmail, normalizeEmail } from '../../src/domain/group/email';
import { canManageGroup } from '../../src/domain/group/roles';
import { failure, nowIso, type CommandResult, type Context } from './context';
import type { Member } from './members';

interface InviteRow {
  email: string;
  state: InviteState;
  invited_by_name: string;
  created_at: string;
  accepted_at: string | null;
}

const SELECT = `SELECT invites.*, members.name AS invited_by_name FROM invites
  JOIN members ON members.id = invites.invited_by`;

function toView(row: InviteRow): InviteView {
  return { email: row.email, state: row.state, invitedByName: row.invited_by_name, createdAt: row.created_at, acceptedAt: row.accepted_at };
}

export function listInvites(ctx: Context, actor: Member): InviteView[] | null {
  if (!canManageGroup(actor)) return null;
  return ctx.sql.all<InviteRow>(`${SELECT} WHERE invites.state != 'revoked' ORDER BY invites.created_at DESC`).map(toView);
}

export function createInvite(ctx: Context, actor: Member, input: { email?: unknown }): CommandResult<InviteView> {
  if (!canManageGroup(actor)) return failure('forbidden');
  if (typeof input.email !== 'string') return failure('invalid');
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email)) return failure('invalid');
  const [member] = ctx.sql.all<{ id: string }>('SELECT id FROM members WHERE email = ? AND active = 1', email);
  if (member) return failure('conflict');

  // A revoked or old accepted invite (someone removed) becomes pending again.
  ctx.sql.run(
    `INSERT INTO invites (email, invited_by, state, created_at) VALUES (?, ?, 'pending', ?)
     ON CONFLICT (email) DO UPDATE SET invited_by = excluded.invited_by, state = 'pending',
       created_at = excluded.created_at, accepted_at = NULL, revoked_at = NULL`,
    email,
    actor.id,
    nowIso(ctx),
  );
  const [row] = ctx.sql.all<InviteRow>(`${SELECT} WHERE invites.email = ?`, email);
  return { ok: true, value: toView(row), changed: ['invites'] };
}

/** Only a pending invite can be revoked. */
export function revokeInvite(ctx: Context, actor: Member, input: { email?: unknown }): CommandResult<null> {
  if (!canManageGroup(actor)) return failure('forbidden');
  if (typeof input.email !== 'string') return failure('invalid');
  const email = normalizeEmail(input.email);
  const [row] = ctx.sql.all<{ state: InviteState }>('SELECT state FROM invites WHERE email = ?', email);
  if (!row) return failure('not_found');
  if (row.state !== 'pending') return failure('conflict');
  ctx.sql.run("UPDATE invites SET state = 'revoked', revoked_at = ? WHERE email = ?", nowIso(ctx), email);
  return { ok: true, value: null, changed: ['invites'] };
}
