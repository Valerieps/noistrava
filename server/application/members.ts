// Members, sign-in and sessions (docs/spec/acesso-e-membros.md).
import type { MemberListItem, MemberView, MeView } from '../../src/application/api-contract';
import { normalizeEmail } from '../../src/domain/group/email';
import { normalizeName } from '../../src/domain/group/profile';
import { isAdmin, keepsAnAdmin, normalizeRoles, type Role } from '../../src/domain/group/roles';
import { failure, nowIso, type CommandResult, type Context } from './context';

export const SESSION_DAYS = 180;

export interface MemberRow {
  id: string;
  google_sub: string | null;
  email: string;
  name: string;
  photo_url: string | null;
  roles: string;
  active: number;
}

export interface Member {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly photoUrl: string | null;
  readonly roles: readonly Role[];
  readonly active: boolean;
}

export interface GoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
  readonly picture: string | null;
}

export function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    photoUrl: row.photo_url,
    roles: normalizeRoles(JSON.parse(row.roles) as string[]),
    active: row.active === 1,
  };
}

export function memberView(member: Member): MemberView {
  return { id: member.id, name: member.name, photoUrl: member.photoUrl, roles: member.roles };
}

export function findMember(ctx: Context, id: string): Member | null {
  const [row] = ctx.sql.all<MemberRow>('SELECT * FROM members WHERE id = ?', id);
  return row ? toMember(row) : null;
}

export function activeAdminIds(ctx: Context): string[] {
  return ctx.sql
    .all<MemberRow>('SELECT * FROM members WHERE active = 1')
    .map(toMember)
    .filter(isAdmin)
    .map((m) => m.id);
}

export type SignInResult = { ok: true; memberId: string } | { ok: false; error: 'no_invite' };

/**
 * Lets a Google account in when it is an active member or has a pending invite. With no admin
 * at all (a brand-new group), the e-mails in `bootstrapAdminEmails` enter as admins.
 * Nothing is created for anyone else.
 */
export function signIn(ctx: Context, profile: GoogleProfile, sessionHash: string, bootstrapAdminEmails: readonly string[]): SignInResult {
  const email = normalizeEmail(profile.email);
  const at = nowIso(ctx);
  return ctx.sql.transaction(() => {
    const [row] = ctx.sql.all<MemberRow>(
      'SELECT * FROM members WHERE google_sub = ? OR email = ? ORDER BY google_sub = ? DESC LIMIT 1',
      profile.sub,
      email,
      profile.sub,
    );
    let memberId: string;

    if (row && row.active === 1) {
      memberId = row.id;
      ctx.sql.run('UPDATE members SET google_sub = ?, photo_url = ? WHERE id = ?', profile.sub, profile.picture, memberId);
    } else {
      const [invite] = ctx.sql.all<{ email: string }>("SELECT email FROM invites WHERE email = ? AND state = 'pending'", email);
      const bootstrap = activeAdminIds(ctx).length === 0 && bootstrapAdminEmails.map(normalizeEmail).includes(email);
      if (!invite && !bootstrap) return { ok: false, error: 'no_invite' } as const;
      const roles: Role[] = bootstrap ? ['admin'] : [];

      if (row) {
        // Back by a new invite: same member, same history.
        memberId = row.id;
        ctx.sql.run(
          'UPDATE members SET active = 1, removed_at = NULL, google_sub = ?, photo_url = ?, roles = ? WHERE id = ?',
          profile.sub,
          profile.picture,
          JSON.stringify(roles),
          memberId,
        );
      } else {
        memberId = ctx.ids.next();
        ctx.sql.run(
          'INSERT INTO members (id, google_sub, email, name, photo_url, roles, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          memberId,
          profile.sub,
          email,
          normalizeName(profile.name) ?? email,
          profile.picture,
          JSON.stringify(roles),
          at,
        );
      }
      if (invite) ctx.sql.run("UPDATE invites SET state = 'accepted', accepted_at = ? WHERE email = ?", at, email);
    }

    const expires = new Date(ctx.clock.now().getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    ctx.sql.run('INSERT INTO sessions (token_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sessionHash, memberId, at, expires);
    return { ok: true, memberId } as const;
  });
}

/** The active member behind a session, or null: removed members lose access at once. */
export function memberForSession(ctx: Context, sessionHash: string): Member | null {
  const [row] = ctx.sql.all<MemberRow>(
    `SELECT members.* FROM sessions JOIN members ON members.id = sessions.member_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND members.active = 1`,
    sessionHash,
    nowIso(ctx),
  );
  return row ? toMember(row) : null;
}

export function signOut(ctx: Context, sessionHash: string): void {
  ctx.sql.run('DELETE FROM sessions WHERE token_hash = ?', sessionHash);
}

export function me(member: Member): MeView {
  return { ...memberView(member), email: member.email };
}

/** Everyone sees name, photo and roles; only admins also see the e-mail. */
export function listMembers(ctx: Context, actor: Member): MemberListItem[] {
  return ctx.sql
    .all<MemberRow>('SELECT * FROM members WHERE active = 1 ORDER BY name COLLATE NOCASE')
    .map(toMember)
    .map((m) => (isAdmin(actor) ? { ...memberView(m), email: m.email } : memberView(m)));
}

/** The member changes their own name. */
export function rename(ctx: Context, actor: Member, input: { name?: unknown }): CommandResult<MeView> {
  if (typeof input.name !== 'string') return failure('invalid');
  const name = normalizeName(input.name);
  if (!name) return failure('invalid');
  ctx.sql.run('UPDATE members SET name = ? WHERE id = ?', name, actor.id);
  return { ok: true, value: me({ ...actor, name }), changed: ['me', 'members'] };
}

/** Only admins give and take roles, and the last admin keeps theirs. */
export function setRoles(ctx: Context, actor: Member, input: { memberId?: unknown; roles?: unknown }): CommandResult<MemberView> {
  if (!isAdmin(actor)) return failure('forbidden');
  if (typeof input.memberId !== 'string' || !Array.isArray(input.roles)) return failure('invalid');
  const target = findMember(ctx, input.memberId);
  if (!target || !target.active) return failure('not_found');
  const roles = normalizeRoles(input.roles.filter((r): r is string => typeof r === 'string'));
  if (isAdmin(target) && !roles.includes('admin') && !keepsAnAdmin(activeAdminIds(ctx), target.id)) {
    return failure('last_admin');
  }
  ctx.sql.run('UPDATE members SET roles = ? WHERE id = ?', JSON.stringify(roles), target.id);
  return { ok: true, value: memberView({ ...target, roles }), changed: ['members', 'me'] };
}

/**
 * Admins only; nobody removes themself, so the last admin always stays. Access ends at once: the
 * sessions go, and the command asks the Durable Object to close the member's live connections.
 * The row stays (inactive), so a new invite brings the same member back.
 */
export function removeMember(ctx: Context, actor: Member, input: { memberId?: unknown }): CommandResult<null> {
  if (!isAdmin(actor)) return failure('forbidden');
  if (typeof input.memberId !== 'string') return failure('invalid');
  if (input.memberId === actor.id) return failure('forbidden');
  const target = findMember(ctx, input.memberId);
  if (!target || !target.active) return failure('not_found');
  if (isAdmin(target) && !keepsAnAdmin(activeAdminIds(ctx), target.id)) return failure('last_admin');

  ctx.sql.run('UPDATE members SET active = 0, removed_at = ? WHERE id = ?', nowIso(ctx), target.id);
  ctx.sql.run('DELETE FROM sessions WHERE member_id = ?', target.id);
  return { ok: true, value: null, changed: ['members'], disconnect: [target.id] };
}
