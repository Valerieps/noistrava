// The Worker: serves the app's files, the API under /api, the live connection and the cron
// (ADR-004). Everything about the group is delegated to the Group Durable Object.
import type { ApiError, ApiResult } from '../../src/application/api-contract';
import { SESSION_DAYS, type GoogleProfile } from '../application/members';
import { grantedAccess } from '../../src/domain/strava';
import { clearCookie, LOGIN_COOKIE, readCookie, SESSION_COOKIE, setCookie, STRAVA_COOKIE } from '../infrastructure/cookies';
import { constantTimeEqual, encryptText, isValidTokenKey, randomToken, sha256 } from '../infrastructure/crypto';
import { devProfile, devSignInAllowed } from '../infrastructure/dev-sign-in';
import {
  authorizationUrl,
  decodePendingLogin,
  encodePendingLogin,
  exchangeCode,
  newPendingLogin,
  profileFromIdToken,
} from '../infrastructure/google-oauth';
import { normalizeSearchQuery, parseRouteRequest, planRoute, searchPlaces, userAgent } from '../infrastructure/openstreetmap';
import { exchangeStravaCode, stravaAuthorizationUrl } from '../infrastructure/strava-oauth';
import type { Env } from './env';
import { Group, SESSION_HASH_HEADER } from './group-object';

export { Group };

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const STATUS: Record<ApiError, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  conflict: 409,
  last_admin: 409,
  unavailable: 503,
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json', ...headers } });
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ ...SECURITY_HEADERS, Location: location });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function group(env: Env) {
  return env.GROUP.get(env.GROUP.idFromName('grupo'));
}

async function sessionHash(request: Request): Promise<string | null> {
  const token = readCookie(request.headers.get('Cookie'), SESSION_COOKIE);
  return token ? sha256(token) : null;
}

/** Requests that change state or open the live connection must come from the app's own pages. */
function sameOrigin(request: Request, url: URL): boolean {
  return request.headers.get('Origin') === url.origin;
}

async function login(env: Env, url: URL): Promise<Response> {
  const pending = newPendingLogin();
  const target = await authorizationUrl(env.GOOGLE_CLIENT_ID, `${url.origin}/api/auth/callback`, pending);
  return redirect(target, [setCookie(LOGIN_COOKIE, encodePendingLogin(pending), 600)]);
}

/** Signs the profile in through the invite rules; the session cookie, or null without invite. */
async function startSession(env: Env, profile: GoogleProfile): Promise<string | null> {
  const token = randomToken();
  const bootstrap = (env.BOOTSTRAP_ADMIN_EMAILS ?? '').split(',').filter(Boolean);
  const result = await group(env).signIn(profile, await sha256(token), bootstrap);
  return result.ok ? setCookie(SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60) : null;
}

/** Starts a session for an e-mail without Google, through the same invite rules (ADR-007). */
async function devSignIn(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { email?: unknown; name?: unknown } | null;
  const profile = body && devProfile(body);
  if (!profile) return json({ error: 'invalid' }, 400);
  const cookie = await startSession(env, profile);
  return cookie ? json({ value: null }, 200, { 'Set-Cookie': cookie }) : json({ error: 'forbidden' }, 403);
}

async function callback(request: Request, env: Env, url: URL): Promise<Response> {
  const pending = decodePendingLogin(readCookie(request.headers.get('Cookie'), LOGIN_COOKIE));
  const code = url.searchParams.get('code');
  const failed = redirect('/?erro=login', [clearCookie(LOGIN_COOKIE)]);
  if (!pending || !code || url.searchParams.get('state') !== pending.state) return failed;

  const idToken = await exchangeCode({
    code,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${url.origin}/api/auth/callback`,
    verifier: pending.verifier,
  });
  const profile = idToken ? profileFromIdToken(idToken, env.GOOGLE_CLIENT_ID, pending.nonce, new Date()) : null;
  if (!profile) return failed;
  const cookie = await startSession(env, profile);
  if (!cookie) return redirect('/?erro=sem-convite', [clearCookie(LOGIN_COOKIE)]);
  return redirect('/', [clearCookie(LOGIN_COOKIE), cookie]);
}

/**
 * "Conectar com Strava": only after the member accepted sharing (docs/spec/strava.md). Answers
 * with Strava's address; the app navigates there and Strava comes back to the callback below.
 */
async function stravaConnect(request: Request, env: Env, url: URL, hash: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { consent?: unknown; includePrivate?: unknown } | null;
  if (body?.consent !== true || typeof body.includePrivate !== 'boolean') return json({ error: 'invalid' }, 400);
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET || !isValidTokenKey(env.STRAVA_TOKEN_KEY)) {
    console.error('Strava is not set up: STRAVA_CLIENT_SECRET missing or STRAVA_TOKEN_KEY not 32 bytes in base64');
    return json({ error: 'unavailable' }, 503);
  }
  if (!(await group(env).query(hash, 'me', {})).ok) return json({ error: 'unauthenticated' }, 401);
  const state = randomToken();
  const target = stravaAuthorizationUrl(env.STRAVA_CLIENT_ID, `${url.origin}/api/strava/callback`, state, body.includePrivate);
  return json({ value: target }, 200, { 'Set-Cookie': setCookie(STRAVA_COOKIE, state, 600) });
}

/** The redirect back from Strava. Any failure, even a thrown one, ends on the app with a message. */
async function stravaCallback(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    return await finishStravaConnection(request, env, url);
  } catch (error) {
    console.error('Strava callback failed', error instanceof Error ? error.message : 'unknown error');
    return redirect('/?strava=erro', [clearCookie(STRAVA_COOKIE)]);
  }
}

async function finishStravaConnection(request: Request, env: Env, url: URL): Promise<Response> {
  const done = (result: string) => redirect(`/?strava=${result}`, [clearCookie(STRAVA_COOKIE)]);
  const cookies = request.headers.get('Cookie');
  const state = readCookie(cookies, STRAVA_COOKIE);
  const hash = await sessionHash(request);
  if (!state || !hash || !constantTimeEqual(url.searchParams.get('state') ?? '', state)) return done('erro');
  if (url.searchParams.get('error')) return done('cancelado');
  const access = grantedAccess(url.searchParams.get('scope'));
  if (!access) return done('sem-permissao');
  const code = url.searchParams.get('code');
  if (!code || !env.STRAVA_CLIENT_SECRET || !env.STRAVA_TOKEN_KEY) return done('erro');

  const tokens = await exchangeStravaCode({ code, clientId: env.STRAVA_CLIENT_ID, clientSecret: env.STRAVA_CLIENT_SECRET });
  if (!tokens) return done('erro');
  const result = await group(env).connectStrava(hash, {
    athleteId: tokens.athleteId,
    accessToken: await encryptText(env.STRAVA_TOKEN_KEY, tokens.accessToken),
    refreshToken: await encryptText(env.STRAVA_TOKEN_KEY, tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    includePrivate: access.includePrivate,
  });
  if (result.ok) return done('conectado');
  return done(result.error === 'conflict' ? 'outra-conta' : 'erro');
}

/**
 * The journey's place search and walking route (ADR-009), for any member: only someone creating a
 * challenge calls them, one call per search or route she asks for. A failure of the public server
 * answers `unavailable`, and the creator tries again later.
 */
async function places(request: Request, env: Env, url: URL, hash: string, kind: 'search' | 'route'): Promise<Response> {
  if (!(await group(env).query(hash, 'me', {})).ok) return json({ error: 'unauthenticated' }, 401);
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const agent = userAgent(url.origin, env.OSM_CONTACT);
  try {
    if (kind === 'search') {
      const query = normalizeSearchQuery(body?.query);
      if (!query) return json({ error: 'invalid' }, 400);
      const found = await searchPlaces(query, agent);
      return found ? json({ value: found }) : json({ error: 'unavailable' }, 503);
    }
    const route = parseRouteRequest(body);
    if (!route) return json({ error: 'invalid' }, 400);
    const planned = await planRoute(route, agent);
    return planned.ok ? json({ value: planned.journey }) : json({ error: planned.error }, STATUS[planned.error]);
  } catch (error) {
    console.error('OpenStreetMap request failed', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'unavailable' }, 503);
  }
}

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/auth/login' && request.method === 'GET') return login(env, url);
  if (path === '/api/auth/callback' && request.method === 'GET') return callback(request, env, url);
  if (path === '/api/strava/callback' && request.method === 'GET') return stravaCallback(request, env, url);

  if (!sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
  const hash = await sessionHash(request);

  if (path === '/api/live' && request.headers.get('Upgrade') === 'websocket') {
    if (!hash) return json({ error: 'unauthenticated' }, 401);
    const headers = new Headers({ Upgrade: 'websocket', [SESSION_HASH_HEADER]: hash });
    return group(env).fetch(new Request(url.toString(), { headers }));
  }

  if (request.method !== 'POST' || request.headers.get('Content-Type') !== 'application/json') {
    return json({ error: 'not_found' }, 404);
  }

  if (path === '/api/auth/logout') {
    if (hash) await group(env).signOut(hash);
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE) });
  }

  if (path === '/api/auth/dev' && devSignInAllowed(env.DEV_SIGN_IN, url)) return devSignIn(request, env);

  if (path === '/api/strava/connect') {
    if (!hash) return json({ error: 'unauthenticated' }, 401);
    return stravaConnect(request, env, url, hash);
  }

  const place = /^\/api\/places\/(search|route)$/.exec(path);
  if (place) {
    if (!hash) return json({ error: 'unauthenticated' }, 401);
    return places(request, env, url, hash, place[1] as 'search' | 'route');
  }

  const match = /^\/api\/(query|command)\/([a-zA-Z.]+)$/.exec(path);
  if (!match) return json({ error: 'not_found' }, 404);
  if (!hash) return json({ error: 'unauthenticated' }, 401);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  const [, kind, name] = match;
  // RPC wraps results in a Disposable, which hides the union from narrowing; restore it.
  const result = (kind === 'query' ? await group(env).query(hash, name, input) : await group(env).command(hash, name, input)) as ApiResult<unknown>;
  return result.ok ? json({ value: result.value }) : json({ error: result.error }, STATUS[result.error]);
}

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, _ctx): Promise<void> {
    await group(env).tick();
  },
} satisfies ExportedHandler<Env>;
