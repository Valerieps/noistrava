// Connecting a member's Strava account (ADR-008). The browser only navigates to Strava and back;
// the code is exchanged here, server to server, with the client secret.
import { stravaScope } from '../../src/domain/strava';

const AUTHORIZE = 'https://www.strava.com/oauth/authorize';
const TOKEN = 'https://www.strava.com/oauth/token';
const DEAUTHORIZE = 'https://www.strava.com/oauth/deauthorize';

export function stravaAuthorizationUrl(clientId: string, redirectUri: string, state: string, includePrivate: boolean): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: stravaScope(includePrivate),
    state,
  });
  return `${AUTHORIZE}?${params}`;
}

export interface StravaTokens {
  readonly athleteId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
}

/** The tokens of a refresh, which carries no athlete; the one already stored stays. */
export type RefreshedTokens = Omit<StravaTokens, 'athleteId'>;

function readTokens(body: Record<string, unknown>): RefreshedTokens | null {
  const { access_token, refresh_token, expires_at } = body;
  if (typeof access_token !== 'string' || typeof refresh_token !== 'string' || typeof expires_at !== 'number') return null;
  return { accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(expires_at * 1000).toISOString() };
}

/** Reads Strava's token response; only the athlete's id is kept from her profile. */
export function tokensFromResponse(body: unknown): StravaTokens | null {
  if (typeof body !== 'object' || body === null) return null;
  const tokens = readTokens(body as Record<string, unknown>);
  const { athlete } = body as Record<string, unknown>;
  const athleteId = typeof athlete === 'object' && athlete !== null ? (athlete as { id?: unknown }).id : undefined;
  if (!tokens || (typeof athleteId !== 'number' && typeof athleteId !== 'string')) return null;
  return { athleteId: String(athleteId), ...tokens };
}

export async function exchangeStravaCode(input: { code: string; clientId: string; clientSecret: string }): Promise<StravaTokens | null> {
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) return null;
  return tokensFromResponse(await response.json().catch(() => null));
}

/** A new access token for an expired one; 'revoked' when Strava refuses the refresh token. */
export async function refreshStravaToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<RefreshedTokens | 'revoked' | null> {
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (response.status === 400 || response.status === 401) return 'revoked';
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  return typeof body === 'object' && body !== null ? readTokens(body as Record<string, unknown>) : null;
}

/** Takes the app's access away on Strava too, when the member disconnects from her profile. */
export async function deauthorizeStrava(accessToken: string): Promise<void> {
  await fetch(DEAUTHORIZE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: accessToken }),
  });
}
