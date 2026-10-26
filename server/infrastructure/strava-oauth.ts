// Connecting a member's Strava account (ADR-008). The browser only navigates to Strava and back;
// the code is exchanged here, server to server, with the client secret.
import { stravaScope } from '../../src/domain/strava';

const AUTHORIZE = 'https://www.strava.com/oauth/authorize';
const TOKEN = 'https://www.strava.com/oauth/token';

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

/** Reads Strava's token response; only the athlete's id is kept from her profile. */
export function tokensFromResponse(body: unknown): StravaTokens | null {
  if (typeof body !== 'object' || body === null) return null;
  const { access_token, refresh_token, expires_at, athlete } = body as Record<string, unknown>;
  const athleteId = typeof athlete === 'object' && athlete !== null ? (athlete as { id?: unknown }).id : undefined;
  if (typeof access_token !== 'string' || typeof refresh_token !== 'string' || typeof expires_at !== 'number') return null;
  if (typeof athleteId !== 'number' && typeof athleteId !== 'string') return null;
  return {
    athleteId: String(athleteId),
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(expires_at * 1000).toISOString(),
  };
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
