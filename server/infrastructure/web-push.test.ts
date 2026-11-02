import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromBase64Url } from './crypto';
import { importVapidKey, sendPush, vapidToken } from './web-push';

async function secret(subject = 'mailto:ana@example.com'): Promise<string> {
  const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify({ subject, jwk: await crypto.subtle.exportKey('jwk', privateKey) });
}

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const now = new Date('2026-11-02T20:00:00Z');

afterEach(() => vi.unstubAllGlobals());

describe('importVapidKey', () => {
  it('reads the secret and derives the public key', async () => {
    const key = await importVapidKey(await secret());
    expect(key?.subject).toBe('mailto:ana@example.com');
    expect(fromBase64Url(key!.publicKey)).toHaveLength(65);
  });

  it('refuses a missing or malformed secret', async () => {
    expect(await importVapidKey(undefined)).toBeNull();
    expect(await importVapidKey('not json')).toBeNull();
    expect(await importVapidKey(await secret('ana@example.com'))).toBeNull();
  });
});

describe('vapidToken', () => {
  it('is an ES256 JWT for the push service, signed with the key', async () => {
    const key = (await importVapidKey(await secret()))!;
    const token = await vapidToken(key, ENDPOINT, now);
    const [header, claims, signature] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now.getTime() / 1000 + 12 * 60 * 60,
      sub: 'mailto:ana@example.com',
    });
    const publicKey = await crypto.subtle.importKey('raw', fromBase64Url(key.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe('sendPush', () => {
  it('posts an empty, signed push and reads the answer', async () => {
    const key = (await importVapidKey(await secret()))!;
    const fetch = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    expect(await sendPush(key, ENDPOINT, now)).toBe('sent');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toMatch(new RegExp(`^vapid t=.+, k=${key.publicKey}$`));
    expect(init.body).toBe('');

    fetch.mockResolvedValueOnce(new Response(null, { status: 410 }));
    expect(await sendPush(key, ENDPOINT, now)).toBe('gone');
    fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await sendPush(key, ENDPOINT, now)).toBe('failed');
  });

  it('never calls a server outside the push services', async () => {
    const key = (await importVapidKey(await secret()))!;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await sendPush(key, 'https://evil.example/x', now)).toBe('gone');
    expect(fetch).not.toHaveBeenCalled();
  });
});
