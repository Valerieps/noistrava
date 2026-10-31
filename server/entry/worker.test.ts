// Requests through the Worker into the Group Durable Object: routes, status codes and payloads,
// the live updates, the cron, and the Durable Object's storage across restarts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChallengeView, LogEntryView, MeView } from '../../src/application/api-contract';
import type { Journey } from '../../src/domain/challenge/challenge';
import { MIGRATIONS } from '../application/schema';
import { LOGIN_COOKIE, SESSION_COOKIE, STRAVA_COOKIE } from '../infrastructure/cookies';
import { testWorker, type TestWorker } from '../testing/worker';
import worker from './worker';

const ORIGIN = 'http://localhost:8787';
const TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

let app: TestWorker;
let network: ReturnType<typeof vi.fn>;
/** What the Worker left running after its response (`ctx.waitUntil`). */
let background: Promise<unknown>[] = [];

/** Tuesday 3 Nov 2026, noon UTC; nothing reaches the network unless a test answers for it. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  network = vi.fn(async () => {
    throw new Error('no network in tests');
  });
  vi.stubGlobal('fetch', network);
  app = testWorker({ DEV_SIGN_IN: '1', BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com' });
  background = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface Call {
  method?: string;
  body?: unknown;
  session?: string;
  cookies?: Record<string, string>;
  origin?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
}

function send(path: string, call: Call = {}, base = ORIGIN): Promise<Response> {
  const headers = new Headers(call.headers);
  const origin = call.origin === undefined ? base : call.origin;
  if (origin) headers.set('Origin', origin);
  const contentType = call.contentType === undefined ? 'application/json' : call.contentType;
  if (contentType) headers.set('Content-Type', contentType);
  const cookies = { ...call.cookies, ...(call.session ? { [SESSION_COOKIE]: call.session } : {}) };
  if (Object.keys(cookies).length > 0) headers.set('Cookie', Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '));
  const body = call.body === undefined ? undefined : typeof call.body === 'string' ? call.body : JSON.stringify(call.body);
  const request = new Request(base + path, { method: call.method ?? (body === undefined ? 'GET' : 'POST'), headers, body });
  const ctx = { waitUntil: (work: Promise<unknown>) => background.push(work), passThroughOnException: () => {} } as unknown as ExecutionContext;
  return worker.fetch(request as Parameters<typeof worker.fetch>[0], app.env, ctx);
}

/** Waits for what the Worker does after answering. */
async function settle(): Promise<void> {
  while (background.length > 0) await background.shift();
}

const query = (session: string, name: string, input: unknown = {}) => send(`/api/query/${name}`, { session, body: input });
const command = (session: string, name: string, input: unknown = {}) => send(`/api/command/${name}`, { session, body: input });

/** The cookie a response sets, by name; '' when it clears it. */
function cookie(response: Response, name: string): string | undefined {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const [key, ...value] = pair.split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

async function signIn(email: string, name: string): Promise<string> {
  const response = await send('/api/auth/dev', { body: { email, name } });
  expect(response.status).toBe(200);
  return cookie(response, SESSION_COOKIE)!;
}

async function value<T>(response: Response | Promise<Response>, status = 200): Promise<T> {
  const done = await response;
  const body = (await done.json()) as { value?: T; error?: string };
  expect({ status: done.status, keys: Object.keys(body) }).toEqual({ status, keys: ['value'] });
  return body.value as T;
}

async function error(response: Response | Promise<Response>): Promise<{ status: number; body: unknown }> {
  const done = await response;
  return { status: done.status, body: await done.json() };
}

/** Ana (admin) and Bia, both signed in, in UTC. */
async function group(): Promise<{ ana: string; bia: string; anaId: string; biaId: string }> {
  const ana = await signIn('ana@example.com', 'Ana');
  await value(command(ana, 'invite.create', { email: 'bia@example.com' }));
  const bia = await signIn('bia@example.com', 'Bia');
  for (const session of [ana, bia]) await value(command(session, 'member.setTimezone', { timezone: 'UTC' }));
  const anaId = (await value<MeView>(query(ana, 'me'))).id;
  const biaId = (await value<MeView>(query(bia, 'me'))).id;
  return { ana, bia, anaId, biaId };
}

const week = { name: 'Semana', startDate: '2026-11-02', endDate: '2026-11-08', goalHours: 10, creatorIsSenhora: true };
const run = (startedAt: string, hours: number) => ({ startedAt, timezone: 'UTC', durationSeconds: hours * 3600, sport: 'Run' });

describe('the Worker outside the API', () => {
  it('serves the app files for every other path', async () => {
    const response = await send('/integrantes', { origin: null, contentType: null });
    expect(response.status).toBe(200);
    expect(app.assets.map((r) => new URL(r.url).pathname)).toEqual(['/integrantes']);
  });
});

describe('API requests', () => {
  it('answer with JSON, never cached, with the security headers', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    const response = await query(ana, 'me');
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await value<MeView>(response)).toEqual({
      id: expect.any(String),
      name: 'Ana',
      email: 'ana@example.com',
      photoUrl: null,
      roles: ['admin'],
      timezone: null,
    });
  });

  it('come only from the app\'s own pages', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    expect(await error(send('/api/query/me', { session: ana, body: {}, origin: 'https://evil.example' }))).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await error(send('/api/query/me', { session: ana, body: {}, origin: null }))).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await error(send('/api/live', { session: ana, origin: 'https://evil.example', headers: { Upgrade: 'websocket' } }))).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
  });

  it('are POSTs of JSON to a known name', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    const notFound = { status: 404, body: { error: 'not_found' } };
    expect(await error(send('/api/query/me', { session: ana }))).toEqual(notFound);
    expect(await error(send('/api/query/me', { session: ana, body: '{}', contentType: 'text/plain' }))).toEqual(notFound);
    expect(await error(send('/api/nada', { session: ana, body: {} }))).toEqual(notFound);
    expect(await error(send('/api/query/me/extra', { session: ana, body: {} }))).toEqual(notFound);
    expect(await error(query(ana, 'everything'))).toEqual(notFound);
    expect(await error(command(ana, 'constructor'))).toEqual(notFound);
    expect(await error(send('/api/query/me', { session: ana, body: '{not json' }))).toEqual({ status: 400, body: { error: 'invalid' } });
  });

  it('need a live session', async () => {
    const unauthenticated = { status: 401, body: { error: 'unauthenticated' } };
    expect(await error(send('/api/query/me', { body: {} }))).toEqual(unauthenticated);
    expect(await error(query('made-up-token', 'me'))).toEqual(unauthenticated);
    expect(await error(send('/api/live', { headers: { Upgrade: 'websocket' } }))).toEqual(unauthenticated);

    const ana = await signIn('ana@example.com', 'Ana');
    const out = await send('/api/auth/logout', { session: ana, body: {} });
    expect(out.status).toBe(200);
    expect(cookie(out, SESSION_COOKIE)).toBe('');
    expect(await error(query(ana, 'me'))).toEqual(unauthenticated);
  });

  it('turn each failure into its status code', async () => {
    const { ana, bia, anaId } = await group();
    expect(await error(command(bia, 'invite.create', { email: 'carla@example.com' }))).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await error(command(ana, 'invite.create', { email: 'not an e-mail' }))).toEqual({ status: 400, body: { error: 'invalid' } });
    expect(await error(command(ana, 'member.setRoles', { memberId: anaId, roles: [] }))).toEqual({ status: 409, body: { error: 'last_admin' } });
    expect(await error(command(ana, 'activity.update', { activityId: 'nope', durationSeconds: 60 }))).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await error(query(ana, 'challenge', { challengeId: 'nope' }))).toEqual({ status: 404, body: { error: 'not_found' } });
    await value(command(ana, 'challenge.create', week));
    expect(await error(command(bia, 'challenge.create', week))).toEqual({ status: 409, body: { error: 'conflict' } });
  });

  it('treat a body that is not an object as empty input', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    expect(await error(command(ana, 'member.rename', [1, 2]))).toEqual({ status: 400, body: { error: 'invalid' } });
    expect(await error(command(ana, 'member.rename', null))).toEqual({ status: 400, body: { error: 'invalid' } });
  });
});

describe('the test sign-in (ADR-007)', () => {
  it('lets in only invited e-mails', async () => {
    expect(await error(send('/api/auth/dev', { body: { email: 'eve@example.com' } }))).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await error(send('/api/auth/dev', { body: { email: 'not an e-mail' } }))).toEqual({ status: 400, body: { error: 'invalid' } });
  });

  it('does not exist without the flag or away from this computer', async () => {
    const notFound = { status: 404, body: { error: 'not_found' } };
    expect(await error(send('/api/auth/dev', { body: { email: 'ana@example.com' } }, 'https://senhoras.example'))).toEqual(notFound);
    app = testWorker({ BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com' });
    expect(await error(send('/api/auth/dev', { body: { email: 'ana@example.com' } }))).toEqual(notFound);
  });

  it('sets a session cookie only the server can read', async () => {
    const response = await send('/api/auth/dev', { body: { email: 'ana@example.com' } });
    expect(response.headers.getSetCookie()).toEqual([expect.stringMatching(/^__Host-sessao=[^;]+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/)]);
  });
});

describe('Google sign-in', () => {
  it('sends the browser to Google with a pending-login cookie', async () => {
    const response = await send('/api/auth/login', { origin: null, contentType: null });
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get('Location')!);
    expect(target.origin + target.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(target.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(cookie(response, LOGIN_COOKIE)).toBeTruthy();
  });

  it('refuses a callback whose state does not match, without calling Google', async () => {
    const login = await send('/api/auth/login', { origin: null, contentType: null });
    const pending = cookie(login, LOGIN_COOKIE)!;
    const response = await send('/api/auth/callback?code=c&state=forged', { origin: null, contentType: null, cookies: { [LOGIN_COOKIE]: pending } });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?erro=login');
    expect(cookie(response, LOGIN_COOKIE)).toBe('');
    expect(network).not.toHaveBeenCalled();
  });
});

describe('connecting Strava', () => {
  beforeEach(() => {
    app = testWorker({ DEV_SIGN_IN: '1', BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com', STRAVA_CLIENT_SECRET: 'strava-secret', STRAVA_TOKEN_KEY: TOKEN_KEY });
  });

  const connect = (session: string | undefined, body: unknown) => send('/api/strava/connect', { session, body });
  const back = (params: string, cookies: Record<string, string>) => send(`/api/strava/callback?${params}`, { origin: null, contentType: null, cookies });

  it('needs a session and the member\'s consent', async () => {
    expect(await error(connect(undefined, { consent: true, includePrivate: false }))).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    const ana = await signIn('ana@example.com', 'Ana');
    expect(await error(connect(ana, { consent: false, includePrivate: false }))).toEqual({ status: 400, body: { error: 'invalid' } });
    expect(await error(connect(ana, { consent: true }))).toEqual({ status: 400, body: { error: 'invalid' } });
    expect(await error(connect('made-up', { consent: true, includePrivate: false }))).toEqual({ status: 401, body: { error: 'unauthenticated' } });
  });

  it('answers unavailable where Strava is not set up', async () => {
    app = testWorker({ DEV_SIGN_IN: '1', BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com' });
    const ana = await signIn('ana@example.com', 'Ana');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await error(connect(ana, { consent: true, includePrivate: false }))).toEqual({ status: 503, body: { error: 'unavailable' } });
  });

  it('goes to Strava and back, keeping the tokens encrypted', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    const response = await connect(ana, { consent: true, includePrivate: true });
    const target = new URL(await value<string>(response));
    expect(target.origin).toBe('https://www.strava.com');
    expect(target.searchParams.get('scope')).toContain('activity:read_all');
    const state = cookie(response, STRAVA_COOKIE)!;
    expect(target.searchParams.get('state')).toBe(state);

    network.mockResolvedValueOnce(Response.json({ access_token: 'plain-access', refresh_token: 'plain-refresh', expires_at: 1_800_000_000, athlete: { id: 42 } }));
    const done = await back(`state=${state}&code=c&scope=read,activity:read_all`, { [STRAVA_COOKIE]: state, [SESSION_COOKIE]: ana });
    expect(done.headers.get('Location')).toBe('/?strava=conectado');
    expect(cookie(done, STRAVA_COOKIE)).toBe('');
    expect(await value(query(ana, 'strava'))).toEqual({ connected: true, includePrivate: true });

    const [stored] = app.durableObject.db.prepare('SELECT athlete_id, access_token, refresh_token FROM strava_connections').all();
    expect(stored).toMatchObject({ athlete_id: '42' });
    expect(JSON.stringify(stored)).not.toContain('plain-');
  });

  it('comes back to the app with a message whatever goes wrong', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    const cookies = { [STRAVA_COOKIE]: 's', [SESSION_COOKIE]: ana };
    const location = async (params: string, sent: Record<string, string> = cookies) => (await back(params, sent)).headers.get('Location');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await location('state=s&code=c&scope=activity:read', { [SESSION_COOKIE]: ana })).toBe('/?strava=erro');
    expect(await location('state=other&code=c&scope=activity:read')).toBe('/?strava=erro');
    expect(await location('state=s&error=access_denied')).toBe('/?strava=cancelado');
    expect(await location('state=s&code=c&scope=read')).toBe('/?strava=sem-permissao');
    // Strava down: the thrown error still ends on the app.
    expect(await location('state=s&code=c&scope=activity:read')).toBe('/?strava=erro');
    network.mockResolvedValueOnce(new Response('nope', { status: 400 }));
    expect(await location('state=s&code=c&scope=activity:read')).toBe('/?strava=erro');
  });
});

describe('activities from Strava (ADR-008)', () => {
  const HOOK = 'hook-secret';
  const LATER = Date.parse('2027-01-01T00:00:00Z') / 1000;
  const ride = {
    id: 1001,
    name: 'Pedal secreto',
    distance: 42_000,
    map: { summary_polyline: 'abc' },
    start_date: '2026-11-03T08:00:00Z',
    timezone: '(GMT-03:00) America/Sao_Paulo',
    elapsed_time: 3600,
    sport_type: 'Ride',
  };

  beforeEach(() => {
    app = testWorker({
      DEV_SIGN_IN: '1',
      BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com',
      STRAVA_CLIENT_SECRET: 'strava-secret',
      STRAVA_TOKEN_KEY: TOKEN_KEY,
      STRAVA_WEBHOOK_SECRET: HOOK,
    });
  });

  /** Strava's side: tokens, the athlete's activities, deauthorization. Returns every call made. */
  function fakeStrava(activities: Record<string, unknown>[], expiresAt = LATER): string[] {
    const calls: string[] = [];
    network.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const auth = new Headers(init?.headers).get('Authorization');
      const form = new URLSearchParams(init?.body ? String(init.body) : '');
      calls.push([init?.method ?? 'GET', url.pathname, form.get('grant_type') ?? auth ?? ''].join(' ').trim());
      if (url.pathname === '/oauth/token' && form.get('grant_type') === 'refresh_token') {
        return Response.json({ access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_at: LATER });
      }
      if (url.pathname === '/oauth/token') return Response.json({ access_token: 'plain-access', refresh_token: 'plain-refresh', expires_at: expiresAt, athlete: { id: 42 } });
      if (url.pathname === '/oauth/deauthorize') return Response.json({ access_token: form.get('access_token') });
      if (url.pathname === '/api/v3/athlete/activities') return Response.json(url.searchParams.get('page') === '1' ? activities : []);
      const one = /^\/api\/v3\/activities\/(\d+)$/.exec(url.pathname);
      const found = one && activities.find((a) => String(a.id) === one[1]);
      return found ? Response.json(found) : Response.json({ message: 'Record Not Found' }, { status: 404 });
    });
    return calls;
  }

  /** Ana connects Strava as athlete 42, through the real redirect. */
  async function connect(ana: string): Promise<void> {
    const target = new URL(await value<string>(send('/api/strava/connect', { session: ana, body: { consent: true, includePrivate: false } })));
    const state = target.searchParams.get('state')!;
    const done = await send(`/api/strava/callback?state=${state}&code=c&scope=read,activity:read`, {
      origin: null,
      contentType: null,
      cookies: { [STRAVA_COOKIE]: state, [SESSION_COOKIE]: ana },
    });
    expect(done.headers.get('Location')).toBe('/?strava=conectado');
    await settle();
  }

  async function connected(): Promise<string> {
    const { ana } = await group();
    await connect(ana);
    return ana;
  }

  const hook = (body: unknown, secret = HOOK) => send(`/api/strava/webhook/${secret}`, { origin: null, body });
  const activityEvent = (aspect: string, id = 1001, owner = 42) => ({
    object_type: 'activity',
    object_id: id,
    aspect_type: aspect,
    owner_id: owner,
    subscription_id: 7,
    event_time: 1_793_000_000,
    updates: {},
  });
  const mine = (session: string) => value<{ startedAt: string; timezone: string; durationSeconds: number; sport: string }[]>(query(session, 'activities'));
  const total = async (session: string) => (await value<{ challenge: ChallengeView }>(query(session, 'challenge'))).challenge.totalSeconds;

  it('answer only at the secret address, and confirm the subscription to Strava', async () => {
    const check = (secret: string, token: string) =>
      send(`/api/strava/webhook/${secret}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc`, { origin: null, contentType: null });
    expect((await check('wrong', HOOK)).status).toBe(404);
    expect((await check(HOOK, 'wrong')).status).toBe(403);
    expect(await error(check(HOOK, HOOK))).toEqual({ status: 200, body: { 'hub.challenge': 'abc' } });
    expect((await hook(activityEvent('create'), 'wrong')).status).toBe(404);

    app = testWorker({ DEV_SIGN_IN: '1', BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com' });
    expect((await check(HOOK, HOOK)).status).toBe(404);
    expect(network).not.toHaveBeenCalled();
  });

  it('arrive from the webhook, keeping only start, zone, total time and sport', async () => {
    const calls = fakeStrava([ride]);
    const ana = await connected();
    await value(command(ana, 'challenge.create', week));
    await settle();

    const response = await hook(activityEvent('create'));
    expect(response.status).toBe(200);
    await settle();
    expect(await mine(ana)).toEqual([
      expect.objectContaining({ startedAt: '2026-11-03T08:00:00.000Z', timezone: 'America/Sao_Paulo', durationSeconds: 3600, sport: 'Ride' }),
    ]);
    expect(await total(ana)).toBe(3600);
    expect(calls).toContain('GET /api/v3/activities/1001 Bearer plain-access');
    const stored = JSON.stringify(app.durableObject.db.prepare('SELECT * FROM activities').all());
    expect(stored).not.toContain('Pedal secreto');
    expect(stored).not.toContain('42000');
  });

  it('never call Strava for an athlete nobody connected, nor for an event the app does not act on', async () => {
    const calls = fakeStrava([ride]);
    await connected();
    calls.length = 0;
    await hook(activityEvent('create', 1001, 99));
    await hook({ object_type: 'athlete', object_id: 42, aspect_type: 'update', owner_id: 42, updates: { name: 'x' } });
    await hook('not json');
    await settle();
    expect(calls).toEqual([]);
  });

  it('refresh an expired token first and keep the new one encrypted', async () => {
    const calls = fakeStrava([ride], Date.now() / 1000 + 60);
    const ana = await connected();
    await hook(activityEvent('create'));
    await settle();
    expect(calls).toContain('POST /oauth/token refresh_token');
    expect(calls.at(-1)).toBe('GET /api/v3/activities/1001 Bearer fresh-access');
    expect(await mine(ana)).toHaveLength(1);
    const [stored] = app.durableObject.db.prepare('SELECT access_token, refresh_token, expires_at FROM strava_connections').all();
    expect(stored).toMatchObject({ expires_at: '2027-01-01T00:00:00.000Z' });
    expect(JSON.stringify(stored)).not.toContain('fresh-');
  });

  it('leave when deleted or made private on Strava, and stop when the app loses access', async () => {
    const activities = [ride, { ...ride, id: 1002 }];
    const calls = fakeStrava(activities);
    const ana = await connected();
    await hook(activityEvent('create'));
    await hook(activityEvent('create', 1002));
    await settle();
    expect(await mine(ana)).toHaveLength(2);

    await hook(activityEvent('delete'));
    activities.pop();
    await hook(activityEvent('update', 1002));
    await settle();
    expect(await mine(ana)).toEqual([]);

    await hook({ object_type: 'athlete', object_id: 42, aspect_type: 'update', owner_id: 42, updates: { authorized: 'false' } });
    await settle();
    expect(await value(query(ana, 'strava'))).toEqual({ connected: false, includePrivate: false });
    calls.length = 0;
    await hook(activityEvent('create'));
    await settle();
    expect(calls).toEqual([]);
  });

  it('come from 90 days before connecting, a running challenge included', async () => {
    const calls = fakeStrava([ride, { ...ride, id: 1003, start_date: '2026-11-02T07:00:00Z', elapsed_time: 1800 }]);
    const { ana } = await group();
    await value(command(ana, 'challenge.create', week));
    await settle();
    expect(calls).toEqual([]);

    await connect(ana);
    const list = (network.mock.calls as [string][]).map(([url]) => new URL(url)).find((url) => url.pathname === '/api/v3/athlete/activities');
    expect(list?.searchParams.get('after')).toBe(String(Date.parse('2026-08-05T12:00:00Z') / 1000 - 1));
    expect(await total(ana)).toBe(5400);

    // The cron finds nothing left to bring.
    calls.length = 0;
    await worker.scheduled({} as ScheduledController, app.env, {} as ExecutionContext);
    expect(calls).toEqual([]);
  });

  it('come again when I pull them from the profile, for one the webhook missed', async () => {
    const activities = [ride];
    fakeStrava(activities);
    const ana = await connected();
    expect(await mine(ana)).toHaveLength(1);

    expect(await error(send('/api/strava/sync', { body: {} }))).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    expect(await value(send('/api/strava/sync', { session: ana, body: {} }))).toEqual({ changed: false });
    activities.push({ ...ride, id: 1002, start_date: '2026-11-04T08:00:00Z' });
    expect(await value(send('/api/strava/sync', { session: ana, body: {} }))).toEqual({ changed: true });
    expect(await mine(ana)).toHaveLength(2);

    await value(send('/api/strava/disconnect', { session: ana, body: {} }));
    expect(await error(send('/api/strava/sync', { session: ana, body: {} }))).toEqual({ status: 409, body: { error: 'conflict' } });
  });

  it('stop arriving when I disconnect from the profile, and the ones that came stay', async () => {
    const calls = fakeStrava([ride]);
    const ana = await connected();
    await hook(activityEvent('create'));
    await settle();

    expect(await error(send('/api/strava/disconnect', { body: {} }))).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    expect(await value(send('/api/strava/disconnect', { session: ana, body: {} }))).toBeNull();
    expect(calls).toContain('POST /oauth/deauthorize');
    expect(await value(query(ana, 'strava'))).toEqual({ connected: false, includePrivate: false });
    expect(await mine(ana)).toHaveLength(1);
    const [stored] = app.durableObject.db.prepare('SELECT access_token, refresh_token FROM strava_connections').all();
    expect(stored).toEqual({ access_token: null, refresh_token: null });
  });
});

describe("the journey's places and route (ADR-009)", () => {
  const lisboa = { name: 'Lisboa', lat: 38.7223, lng: -9.1393 };
  const cascais = { name: 'Cascais', lat: 38.6979, lng: -9.4215 };
  const oeiras = { name: 'Oeiras', lat: 38.69, lng: -9.31 };
  const search = (session: string | undefined, body: unknown) => send('/api/places/search', { session, body });
  const route = (session: string | undefined, body: unknown) => send('/api/places/route', { session, body });

  it('needs a session and valid input, without calling OpenStreetMap', async () => {
    expect(await error(search(undefined, { query: 'Lisboa' }))).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    expect(await error(search('made-up', { query: 'Lisboa' }))).toEqual({ status: 401, body: { error: 'unauthenticated' } });
    const ana = await signIn('ana@example.com', 'Ana');
    expect(await error(search(ana, { query: 'L' }))).toEqual({ status: 400, body: { error: 'invalid' } });
    expect(await error(route(ana, { start: lisboa }))).toEqual({ status: 400, body: { error: 'invalid' } });
    expect(network).not.toHaveBeenCalled();
  });

  it('searches places with an identifying User-Agent', async () => {
    app = testWorker({ DEV_SIGN_IN: '1', BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com', OSM_CONTACT: 'grupo@example.com' });
    const ana = await signIn('ana@example.com', 'Ana');
    network.mockResolvedValueOnce(Response.json([{ name: 'Lisboa', display_name: 'Lisboa, Portugal', lat: '38.72', lon: '-9.14' }]));
    expect(await value(search(ana, { query: 'Lisboa' }))).toEqual([{ name: 'Lisboa', detail: 'Lisboa, Portugal', lat: 38.72, lng: -9.14 }]);
    const [url, init] = network.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).origin).toBe('https://nominatim.openstreetmap.org');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(`Senhoras/1.0 (+${ORIGIN}; grupo@example.com)`);
  });

  it('computes the driving route through the stops, as a journey the challenge accepts', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    network.mockResolvedValueOnce(
      Response.json({
        code: 'Ok',
        routes: [{ distance: 30_000, legs: [{ distance: 12_000 }, { distance: 18_000 }], geometry: { coordinates: [[-9.1393, 38.7223], [-9.4215, 38.6979]] } }],
      }),
    );
    const journey = await value<Journey>(route(ana, { start: lisboa, end: cascais, stops: [oeiras] }));
    expect(journey.stops).toEqual([{ ...oeiras, distanceMeters: 12_000 }]);
    expect(network).toHaveBeenCalledTimes(1);
    const created = await value<{ id: string }>(command(ana, 'challenge.create', { name: 'Até Cascais', startDate: '2026-11-02', endDate: '2026-11-08', journey, creatorIsSenhora: true }));
    const view = await value<{ challenge: ChallengeView }>(query(ana, 'challenge', { challengeId: created.id }));
    expect(view.challenge.goalMinutes).toBe(6 * 60);
    expect(view.challenge.journey?.end.name).toBe('Cascais');
    expect(view.challenge.journey?.stops.map((s) => s.name)).toEqual(['Oeiras']);
  });

  it('tells a missing driving route from a server that is down', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    network.mockResolvedValueOnce(Response.json({ code: 'NoRoute', message: 'Impossible route' }, { status: 400 }));
    expect(await error(route(ana, { start: lisboa, end: cascais, stops: [] }))).toEqual({ status: 400, body: { error: 'invalid' } });
    network.mockResolvedValueOnce(new Response('busy', { status: 429 }));
    expect(await error(route(ana, { start: lisboa, end: cascais, stops: [] }))).toEqual({ status: 503, body: { error: 'unavailable' } });
    network.mockResolvedValueOnce(new Response('down', { status: 502 }));
    expect(await error(search(ana, { query: 'Lisboa' }))).toEqual({ status: 503, body: { error: 'unavailable' } });
    // The network itself failing.
    expect(await error(search(ana, { query: 'Lisboa' }))).toEqual({ status: 503, body: { error: 'unavailable' } });
  });
});

describe('the Group Durable Object', () => {
  it('runs a challenge end to end and tells every open app what changed', async () => {
    const { ana, bia, anaId, biaId } = await group();
    const anaApp = app.durableObject.connect(anaId);
    const biaApp = app.durableObject.connect(biaId);

    const challenge = await value<ChallengeView>(command(ana, 'challenge.create', week));
    expect(challenge).toMatchObject({ name: 'Semana', state: 'open', goalMinutes: 600, myResponse: 'accepted', startsAt: '2026-11-02T00:00:00.000Z', endsAt: '2026-11-09T00:00:00.000Z' });
    expect(biaApp.sent).toEqual([{ type: 'changed', topics: ['challenge'] }]);

    const activity = await value<{ id: string }>(command(ana, 'activity.create', run('2026-11-02T08:00:00Z', 3)));
    await value(command(bia, 'reaction.set', { challengeId: challenge.id, activityId: activity.id, heart: true }));
    expect(await value<LogEntryView[]>(query(bia, 'challengeLog', { challengeId: challenge.id }))).toEqual([
      {
        activityId: activity.id,
        memberId: anaId,
        memberName: 'Ana',
        startedAt: '2026-11-02T08:00:00.000Z',
        timezone: 'UTC',
        durationSeconds: 10_800,
        sport: 'Run',
        hearts: 1,
        heartedByMe: true,
      },
    ]);
    expect(await value<{ challenge: ChallengeView }>(query(bia, 'challenge'))).toMatchObject({
      challenge: { totalSeconds: 10_800, percent: 30, myResponse: 'pending', milestones: [{ milestone: '25%' }] },
    });
    expect(anaApp.sent).toEqual([
      { type: 'changed', topics: ['challenge'] },
      { type: 'changed', topics: ['activities', 'challenge'] },
      { type: 'changed', topics: ['challenge'] },
    ]);

    // A read changes nothing, and a command that changes nothing tells nobody.
    await value(command(bia, 'member.setTimezone', { timezone: 'UTC' }));
    expect(biaApp.sent).toHaveLength(3);
  });

  it('closes the live connections of a removed member, and only hers', async () => {
    const { ana, bia, anaId, biaId } = await group();
    const anaApp = app.durableObject.connect(anaId);
    const biaApp = app.durableObject.connect(biaId);
    await value(command(ana, 'member.remove', { memberId: biaId }));
    expect(biaApp.closed).toEqual({ code: 4401, reason: 'removed' });
    expect(anaApp.closed).toBeNull();
    expect(await error(query(bia, 'me'))).toEqual({ status: 401, body: { error: 'unauthenticated' } });
  });

  it('refuses a live connection for an unknown session', async () => {
    const group = app.env.GROUP.get(app.env.GROUP.idFromName('grupo'));
    const response = await group.fetch(new Request(`${ORIGIN}/api/live`, { headers: { Upgrade: 'websocket', 'x-app-session-hash': 'nobody' } }));
    expect(response.status).toBe(401);
  });

  it('runs one command at a time: two challenges created together give one conflict', async () => {
    const { ana, bia } = await group();
    const results = await Promise.all([command(ana, 'challenge.create', week), command(bia, 'challenge.create', { ...week, name: 'Outro' })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('keeps everything when it restarts, and migrates only once', async () => {
    const { ana, bia } = await group();
    const { id } = await value<ChallengeView>(command(ana, 'challenge.create', week));
    await value(command(ana, 'activity.create', run('2026-11-02T08:00:00Z', 2)));

    app.restart();
    expect(await value<{ challenge: ChallengeView }>(query(bia, 'challenge'))).toMatchObject({ challenge: { id, totalSeconds: 7200 } });
    expect(app.durableObject.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: MIGRATIONS.length });
  });

  it('ends and closes challenges on the cron', async () => {
    const { ana, anaId } = await group();
    const { id } = await value<ChallengeView>(command(ana, 'challenge.create', week));
    await value(command(ana, 'activity.create', run('2026-11-02T08:00:00Z', 4)));
    const anaApp = app.durableObject.connect(anaId);
    const cron = () => worker.scheduled({} as ScheduledController, app.env, {} as ExecutionContext);

    vi.setSystemTime(new Date('2026-11-09T00:05:00Z'));
    await cron();
    expect(await value<{ challenge: ChallengeView }>(query(ana, 'challenge'))).toMatchObject({ challenge: { id, state: 'failed', percent: 40, closed: false } });

    vi.setSystemTime(new Date('2026-11-10T00:05:00Z'));
    await cron();
    await cron();
    expect(await value(query(ana, 'challenge'))).toEqual({ challenge: null });
    expect(await value(query(ana, 'history'))).toEqual([expect.objectContaining({ id, state: 'failed', totalSeconds: 14_400, percent: 40 })]);
    expect(anaApp.sent).toEqual([
      { type: 'changed', topics: ['challenge', 'history'] },
      { type: 'changed', topics: ['challenge', 'history'] },
    ]);
  });
});
