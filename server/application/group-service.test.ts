import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock, memorySql, sequentialIds } from '../testing/node-sql';
import { GroupService } from './group-service';
import type { GoogleProfile } from './members';
import type { Sql } from './ports';
import { MIGRATIONS } from './schema';

const profile = (email: string, name = email.split('@')[0]): GoogleProfile => ({ sub: `sub:${email}`, email, name, picture: null });
const ADMIN = 'ana@example.com';

let clock: ReturnType<typeof fixedClock>;
let service: GroupService;

beforeEach(() => {
  clock = fixedClock('2026-10-21T12:00:00Z');
  service = new GroupService(memorySql(), clock, sequentialIds());
  service.migrate();
});

/** Signs the bootstrap admin in; returns her session hash. */
function signInAdmin(): string {
  expect(service.signIn(profile(ADMIN, 'Ana'), 'h-ana', [ADMIN])).toMatchObject({ ok: true });
  return 'h-ana';
}

function invite(admin: string, email: string) {
  return service.command(admin, 'invite.create', { email });
}

describe('sign-in', () => {
  it('lets nobody in without an invite, and stores nothing', () => {
    expect(service.signIn(profile('eve@example.com'), 'h-eve', [])).toEqual({ ok: false, error: 'no_invite' });
    expect(service.memberForSession('h-eve')).toBeNull();
  });

  it('lets the bootstrap e-mails in as admins only while there is no admin', () => {
    const admin = signInAdmin();
    expect(service.query(admin, 'me', {})).toMatchObject({ ok: true, value: { name: 'Ana', roles: ['admin'] } });
    expect(service.signIn(profile('bia@example.com'), 'h-bia', [ADMIN, 'bia@example.com'])).toEqual({ ok: false, error: 'no_invite' });
  });

  it('accepts a pending invite once, matching the e-mail in any case', () => {
    const admin = signInAdmin();
    invite(admin, 'Carla@Example.com');
    expect(service.signIn(profile('carla@example.com'), 'h-carla', [])).toMatchObject({ ok: true });
    expect(service.query(admin, 'invites', {})).toMatchObject({ ok: true, value: [{ email: 'carla@example.com', state: 'accepted' }] });
    expect(service.query('h-carla', 'me', {})).toMatchObject({ ok: true, value: { roles: [] } });
  });

  it('ends the session on sign-out and when it expires', () => {
    const admin = signInAdmin();
    service.signOut(admin);
    expect(service.query(admin, 'me', {})).toEqual({ ok: false, error: 'unauthenticated' });

    service.signIn(profile(ADMIN), 'h-2', []);
    clock.set('2027-10-21T12:00:00Z');
    expect(service.memberForSession('h-2')).toBeNull();
  });
});

describe('invites', () => {
  it('are for admins only', () => {
    const admin = signInAdmin();
    invite(admin, 'carla@example.com');
    service.signIn(profile('carla@example.com'), 'h-carla', []);
    expect(invite('h-carla', 'dani@example.com')).toEqual({ ok: false, error: 'forbidden' });
    expect(service.query('h-carla', 'invites', {})).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuse bad e-mails and current members', () => {
    const admin = signInAdmin();
    expect(invite(admin, 'not an e-mail')).toEqual({ ok: false, error: 'invalid' });
    expect(invite(admin, ADMIN)).toEqual({ ok: false, error: 'conflict' });
  });

  it('can be revoked while pending, and then let nobody in', () => {
    const admin = signInAdmin();
    invite(admin, 'carla@example.com');
    expect(service.command(admin, 'invite.revoke', { email: 'carla@example.com' })).toMatchObject({ ok: true });
    expect(service.signIn(profile('carla@example.com'), 'h-carla', [])).toEqual({ ok: false, error: 'no_invite' });
  });
});

describe('members', () => {
  function withCarla(): { admin: string; carlaId: string } {
    const admin = signInAdmin();
    invite(admin, 'carla@example.com');
    service.signIn(profile('carla@example.com', 'Carla'), 'h-carla', []);
    const me = service.query('h-carla', 'me', {});
    if (!me.ok) throw new Error('Carla did not sign in');
    return { admin, carlaId: (me.value as { id: string }).id };
  }

  it('shows e-mails to admins only', () => {
    const { admin } = withCarla();
    expect(service.query(admin, 'members', {})).toMatchObject({ ok: true, value: [{ name: 'Ana', email: ADMIN }, { name: 'Carla' }] });
    const seen = service.query('h-carla', 'members', {});
    expect(seen.ok && (seen.value as object[]).every((m) => !('email' in m))).toBe(true);
  });

  it('never lose the last admin', () => {
    const { admin, carlaId } = withCarla();
    const anaId = (service.query(admin, 'me', {}) as { value: { id: string } }).value.id;
    expect(service.command(admin, 'member.setRoles', { memberId: anaId, roles: [] })).toEqual({ ok: false, error: 'last_admin' });
    expect(service.command(admin, 'member.setRoles', { memberId: carlaId, roles: ['admin'] })).toMatchObject({ ok: true });
    expect(service.command(admin, 'member.setRoles', { memberId: anaId, roles: [] })).toMatchObject({ ok: true });
  });

  it('lose access at once when removed, and come back with a new invite', () => {
    const { admin, carlaId } = withCarla();
    expect(service.command(admin, 'member.remove', { memberId: carlaId })).toMatchObject({ ok: true, disconnect: [carlaId] });
    expect(service.memberForSession('h-carla')).toBeNull();
    expect(service.signIn(profile('carla@example.com'), 'h-carla-2', [])).toEqual({ ok: false, error: 'no_invite' });

    invite(admin, 'carla@example.com');
    service.signIn(profile('carla@example.com'), 'h-carla-3', []);
    expect(service.memberForSession('h-carla-3')?.id).toBe(carlaId);
  });

  it('cannot remove themselves', () => {
    const admin = signInAdmin();
    const anaId = (service.query(admin, 'me', {}) as { value: { id: string } }).value.id;
    expect(service.command(admin, 'member.remove', { memberId: anaId })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rename themselves within the name rules', () => {
    const admin = signInAdmin();
    expect(service.command(admin, 'member.rename', { name: '  Ana  Maria ' })).toMatchObject({ ok: true, value: { name: 'Ana Maria' } });
    expect(service.command(admin, 'member.rename', { name: ' ' })).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('the API surface', () => {
  it('answers unknown names with not_found, even for inherited object keys', () => {
    const admin = signInAdmin();
    expect(service.query(admin, 'toString', {})).toEqual({ ok: false, error: 'not_found' });
    expect(service.command(admin, 'constructor', {})).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('strava', () => {
  const connection = (athleteId: string) => ({
    athleteId,
    accessToken: 'sealed-access',
    refreshToken: 'sealed-refresh',
    expiresAt: '2026-10-21T18:00:00Z',
    includePrivate: false,
  });

  it('starts disconnected and stores a connection for the signed-in member only', () => {
    const admin = signInAdmin();
    expect(service.query(admin, 'strava', {})).toEqual({ ok: true, value: { connected: false, includePrivate: false } });
    expect(service.connectStrava('h-nobody', connection('1'))).toEqual({ ok: false, error: 'unauthenticated' });
    expect(service.connectStrava(admin, { ...connection('1'), includePrivate: true })).toEqual({ ok: true });
    expect(service.query(admin, 'strava', {})).toEqual({ ok: true, value: { connected: true, includePrivate: true } });
  });

  it('replaces her own connection, but never takes a Strava account another member connected', () => {
    const admin = signInAdmin();
    invite(admin, 'bia@example.com');
    service.signIn(profile('bia@example.com'), 'h-bia', []);
    expect(service.connectStrava(admin, connection('1'))).toEqual({ ok: true });
    expect(service.connectStrava(admin, connection('1'))).toEqual({ ok: true });
    expect(service.connectStrava('h-bia', connection('1'))).toEqual({ ok: false, error: 'conflict' });
    expect(service.query('h-bia', 'strava', {})).toMatchObject({ ok: true, value: { connected: false } });
  });
});

describe('storage', () => {
  it('migrates once, and keeps everything for the next instance over the same database', () => {
    const sql = memorySql();
    const first = new GroupService(sql, clock, sequentialIds());
    first.migrate();
    first.signIn(profile(ADMIN, 'Ana'), 'h-ana', [ADMIN]);
    first.migrate();

    const next = new GroupService(sql, clock, sequentialIds());
    next.migrate();
    expect(next.query('h-ana', 'me', {})).toMatchObject({ ok: true, value: { name: 'Ana' } });
    expect(sql.all('SELECT version FROM schema_migrations')).toHaveLength(MIGRATIONS.length);
  });

  it('runs each command in one transaction: a failure halfway leaves nothing behind', () => {
    const sql = memorySql();
    let failOn: RegExp | null = null;
    const flaky: Sql = {
      ...sql,
      run: (query, ...bindings) => {
        if (failOn?.test(query)) throw new Error('disk full');
        sql.run(query, ...bindings);
      },
    };
    service = new GroupService(flaky, clock, sequentialIds());
    service.migrate();
    const admin = signInAdmin();
    const setup = { name: 'Semana', startDate: '2026-10-19', endDate: '2026-10-25', goalHours: 10, creatorIsSenhora: true };

    // The challenge row goes in, then the members' invites fail.
    failOn = /INSERT INTO challenge_members/;
    expect(() => service.command(admin, 'challenge.create', setup)).toThrow('disk full');
    failOn = null;
    expect(sql.all('SELECT id FROM challenges')).toEqual([]);
    expect(service.command(admin, 'challenge.create', setup)).toMatchObject({ ok: true });
  });

  it('drops expired sessions on the cron', () => {
    const sql = memorySql();
    service = new GroupService(sql, clock, sequentialIds());
    service.migrate();
    signInAdmin();
    clock.set('2027-10-21T12:00:00Z');
    service.tick();
    expect(sql.all('SELECT * FROM sessions')).toEqual([]);
  });
});
