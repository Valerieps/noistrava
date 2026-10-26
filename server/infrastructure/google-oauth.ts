// Google sign-in with the authorization code flow and PKCE (ADR-005). The browser only navigates
// to Google and back; the code is exchanged here, server to server, with the client secret.
import type { GoogleProfile } from '../application/members';
import { fromBase64Url, randomToken, sha256 } from './crypto';

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface PendingLogin {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
}

export function newPendingLogin(): PendingLogin {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(48) };
}

export function encodePendingLogin(p: PendingLogin): string {
  return `${p.state}.${p.nonce}.${p.verifier}`;
}

export function decodePendingLogin(value: string | null): PendingLogin | null {
  const [state, nonce, verifier] = value?.split('.') ?? [];
  return state && nonce && verifier ? { state, nonce, verifier } : null;
}

export async function authorizationUrl(clientId: string, redirectUri: string, pending: PendingLogin): Promise<string> {
  const challenge = await sha256(pending.verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTHORIZE}?${params}`;
}

export async function exchangeCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  verifier: string;
}): Promise<string | null> {
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.verifier,
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { id_token?: unknown };
  return typeof body.id_token === 'string' ? body.id_token : null;
}

/**
 * Reads the ID token Google just returned over TLS to this server. Google's docs allow skipping
 * the signature check in that case; the claims are still checked.
 */
export function profileFromIdToken(idToken: string, clientId: string, nonce: string, now: Date): GoogleProfile | null {
  const [, payload] = idToken.split('.');
  if (!payload) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Record<string, unknown>;
  } catch {
    return null;
  }
  const valid =
    ISSUERS.includes(String(claims.iss)) &&
    claims.aud === clientId &&
    claims.nonce === nonce &&
    typeof claims.exp === 'number' &&
    claims.exp * 1000 > now.getTime() &&
    claims.email_verified === true &&
    typeof claims.sub === 'string' &&
    typeof claims.email === 'string';
  if (!valid) return null;
  return {
    sub: claims.sub as string,
    email: claims.email as string,
    name: typeof claims.name === 'string' ? claims.name : '',
    picture: typeof claims.picture === 'string' ? claims.picture : null,
  };
}
