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

/** Tuesday 3 Nov 2026, noon UTC; nothing reaches the network unless a test answers for it. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  network = vi.fn(async () => {
    throw new Error('no network in tests');
  });
  vi.stubGlobal('fetch', network);
  app = testWorker({ DEV_SIGN_IN: '1', BOOTSTRAP_ADMIN_EMAILS: 'ana@example.com' });
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
  return worker.fetch(request as Parameters<typeof worker.fetch>[0], app.env, {} as ExecutionContext);
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

describe("the journey's places and route (ADR-009)", () => {
  const lisboa = { name: 'Lisboa', lat: 38.7223, lng: -9.1393 };
  const cascais = { name: 'Cascais', lat: 38.6979, lng: -9.4215 };
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

  const osrm = () => Response.json({ code: 'Ok', routes: [{ distance: 30_000, geometry: { coordinates: [[-9.1393, 38.7223], [-9.4215, 38.6979]] } }] });

  it('computes the walking route with its stops, as a journey the challenge accepts', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    network.mockResolvedValueOnce(osrm());
    network.mockResolvedValueOnce(Response.json({ elements: [{ type: 'node', lat: 38.69, lon: -9.31, tags: { place: 'town', name: 'Oeiras' } }] }));
    const journey = await value<Journey>(route(ana, { start: lisboa, end: cascais }));
    expect(journey.stops.map((s) => s.name)).toEqual(['Oeiras']);
    const [url, init] = network.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(init.method).toBe('POST');
    const created = await value<{ id: string }>(command(ana, 'challenge.create', { name: 'Até Cascais', startDate: '2026-11-02', endDate: '2026-11-08', journey, creatorIsSenhora: true }));
    const view = await value<{ challenge: ChallengeView }>(query(ana, 'challenge', { challengeId: created.id }));
    expect(view.challenge.goalMinutes).toBe(6 * 60);
    expect(view.challenge.journey?.end.name).toBe('Cascais');
    expect(view.challenge.journey?.stops.map((s) => s.name)).toEqual(['Oeiras']);
  });

  it('keeps the route without stops when Overpass does not answer', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    network.mockResolvedValueOnce(osrm());
    network.mockResolvedValueOnce(new Response('busy', { status: 504 }));
    expect((await value<Journey>(route(ana, { start: lisboa, end: cascais }))).stops).toEqual([]);
    network.mockResolvedValueOnce(osrm());
    expect((await value<Journey>(route(ana, { start: lisboa, end: cascais }))).stops).toEqual([]);
  });

  it('tells a missing walking route from a server that is down', async () => {
    const ana = await signIn('ana@example.com', 'Ana');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    network.mockResolvedValueOnce(Response.json({ code: 'NoRoute', message: 'Impossible route' }, { status: 400 }));
    expect(await error(route(ana, { start: lisboa, end: cascais }))).toEqual({ status: 400, body: { error: 'invalid' } });
    network.mockResolvedValueOnce(new Response('busy', { status: 429 }));
    expect(await error(route(ana, { start: lisboa, end: cascais }))).toEqual({ status: 503, body: { error: 'unavailable' } });
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
