import { describe, expect, it } from 'vitest';
import { clearCookie, readCookie, setCookie } from './cookies';
import { base64Url, constantTimeEqual, decryptText, encryptText, isValidTokenKey } from './crypto';
import { authorizationUrl, decodePendingLogin, encodePendingLogin, newPendingLogin, profileFromIdToken } from './google-oauth';
import { devProfile, devSignInAllowed } from './dev-sign-in';
import { stravaAuthorizationUrl, tokensFromResponse } from './strava-oauth';

function idToken(claims: object): string {
  const part = (o: object) => base64Url(new TextEncoder().encode(JSON.stringify(o)));
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

const now = new Date('2026-10-21T15:00:00Z');
const good = {
  iss: 'https://accounts.google.com',
  aud: 'client',
  nonce: 'n',
  exp: now.getTime() / 1000 + 60,
  email_verified: true,
  sub: '123',
  email: 'carla@example.com',
  name: 'Carla',
  picture: 'https://lh3.googleusercontent.com/a/x',
};

describe('profileFromIdToken', () => {
  it('reads a valid token', () => {
    expect(profileFromIdToken(idToken(good), 'client', 'n', now)).toEqual({
      sub: '123',
      email: 'carla@example.com',
      name: 'Carla',
      picture: 'https://lh3.googleusercontent.com/a/x',
    });
  });

  it.each([
    ['another audience', { aud: 'other' }],
    ['another nonce', { nonce: 'x' }],
    ['an expired token', { exp: now.getTime() / 1000 - 1 }],
    ['an unverified e-mail', { email_verified: false }],
    ['another issuer', { iss: 'https://evil.example' }],
  ])('refuses %s', (_name, change) => {
    expect(profileFromIdToken(idToken({ ...good, ...change }), 'client', 'n', now)).toBeNull();
  });

  it('refuses garbage', () => {
    expect(profileFromIdToken('not-a-token', 'client', 'n', now)).toBeNull();
  });
});

describe('login flow pieces', () => {
  it('round-trips the pending login cookie', () => {
    const p = newPendingLogin();
    expect(decodePendingLogin(encodePendingLogin(p))).toEqual(p);
    expect(decodePendingLogin('a.b')).toBeNull();
    expect(decodePendingLogin(null)).toBeNull();
  });

  it('sends PKCE and the state to Google', async () => {
    const url = new URL(await authorizationUrl('client', 'http://localhost:5173/api/auth/callback', newPendingLogin()));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toBeTruthy();
  });
});

describe('cookies', () => {
  it('reads one cookie among many', () => {
    expect(readCookie('a=1; __Host-sessao=abc; b=2', '__Host-sessao')).toBe('abc');
    expect(readCookie('a=1', '__Host-sessao')).toBeNull();
  });

  it('are HttpOnly, Secure and Lax', () => {
    expect(setCookie('__Host-sessao', 'x', 10)).toBe('__Host-sessao=x; Path=/; Max-Age=10; HttpOnly; Secure; SameSite=Lax');
    expect(clearCookie('__Host-sessao')).toContain('Max-Age=0');
  });
});

describe('constantTimeEqual', () => {
  it('compares', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('dev sign-in', () => {
  it('is on only with the flag and only on this computer', () => {
    expect(devSignInAllowed('1', new URL('http://localhost:4173/api/auth/dev'))).toBe(true);
    expect(devSignInAllowed('1', new URL('http://127.0.0.1:8787/api/auth/dev'))).toBe(true);
    expect(devSignInAllowed('1', new URL('http://[::1]:8787/api/auth/dev'))).toBe(true);
    expect(devSignInAllowed(undefined, new URL('http://localhost:4173/api/auth/dev'))).toBe(false);
    expect(devSignInAllowed('true', new URL('http://localhost:4173/api/auth/dev'))).toBe(false);
    expect(devSignInAllowed('1', new URL('https://app-name.workers.dev/api/auth/dev'))).toBe(false);
    expect(devSignInAllowed('1', new URL('https://localhost.example.com/api/auth/dev'))).toBe(false);
  });

  it('stands for the typed e-mail, with no photo', () => {
    expect(devProfile({ email: ' Carla@Example.com ', name: 'Carla' })).toEqual({
      sub: 'dev:carla@example.com',
      email: 'carla@example.com',
      name: 'Carla',
      picture: null,
    });
    expect(devProfile({ email: 'dani@example.com', name: '' })).toMatchObject({ name: 'dani' });
    expect(devProfile({ email: 'not an e-mail' })).toBeNull();
    expect(devProfile({ email: null })).toBeNull();
  });
});

describe('token encryption', () => {
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

  it('round-trips, with a fresh IV each time', async () => {
    const a = await encryptText(key, 'secret-token');
    const b = await encryptText(key, 'secret-token');
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret-token');
    expect(await decryptText(key, a)).toBe('secret-token');
  });

  it('accepts only a 32-byte key in base64', () => {
    expect(isValidTokenKey(key)).toBe(true);
    expect(isValidTokenKey('0123456789abcdef0123456789abcdef01234567')).toBe(false);
    expect(isValidTokenKey('not base64 at all!')).toBe(false);
    expect(isValidTokenKey(undefined)).toBe(false);
  });

  it('refuses a key of the wrong size and a tampered text', async () => {
    await expect(encryptText(btoa('short'), 'x')).rejects.toThrow();
    const sealed = await encryptText(key, 'secret-token');
    await expect(decryptText(key, `${sealed.slice(0, -2)}AA`)).rejects.toThrow();
  });
});

describe('strava oauth', () => {
  it('asks only for the scope the member chose', () => {
    const url = new URL(stravaAuthorizationUrl('291174', 'https://app.example/api/strava/callback', 's', false));
    expect(url.origin + url.pathname).toBe('https://www.strava.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('activity:read');
    expect(url.searchParams.get('state')).toBe('s');
    expect(new URL(stravaAuthorizationUrl('1', 'https://x.example/cb', 's', true)).searchParams.get('scope')).toBe('activity:read_all');
  });

  it('keeps only the athlete id and the tokens from the response', () => {
    const tokens = tokensFromResponse({
      access_token: 'a',
      refresh_token: 'r',
      expires_at: 1792000000,
      athlete: { id: 42, firstname: 'Ana', city: 'Lisboa' },
    });
    expect(tokens).toEqual({ athleteId: '42', accessToken: 'a', refreshToken: 'r', expiresAt: new Date(1792000000 * 1000).toISOString() });
    expect(tokensFromResponse({ access_token: 'a' })).toBeNull();
    expect(tokensFromResponse(null)).toBeNull();
  });
});
