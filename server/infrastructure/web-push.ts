// Web Push without a payload (ADR-012): the push only wakes the app's service worker, which shows
// the reminder's fixed text. So nothing is encrypted; the request is only signed with the VAPID
// key, which lives in the VAPID_KEY secret.
import { PUSH_ORIGINS } from '../../network-policy';
import { isPushEndpoint } from '../../src/domain/reminder';
import { base64Url, fromBase64Url } from './crypto';

/** VAPID_KEY: `{"subject": "mailto:...", "jwk": <P-256 private key as JWK>}`, made by scripts/vapid-key.mjs. */
export interface VapidKey {
  readonly subject: string;
  readonly privateKey: CryptoKey;
  /** The uncompressed public point, base64url: the app subscribes with it. */
  readonly publicKey: string;
}

export async function importVapidKey(secret: string | undefined): Promise<VapidKey | null> {
  if (!secret) return null;
  try {
    const { subject, jwk } = JSON.parse(secret) as { subject?: unknown; jwk?: JsonWebKey };
    if (typeof subject !== 'string' || !/^(mailto:|https:)/.test(subject) || !jwk?.x || !jwk.y || !jwk.d) return null;
    const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const point = new Uint8Array([4, ...fromBase64Url(jwk.x), ...fromBase64Url(jwk.y)]);
    return point.length === 65 ? { subject, privateKey, publicKey: base64Url(point) } : null;
  } catch {
    return null;
  }
}

/** The VAPID JWT for one push service, valid for 12 hours (the most push services accept is 24). */
export async function vapidToken(key: VapidKey, endpoint: string, now: Date): Promise<string> {
  const encode = (value: object) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60, sub: key.subject };
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

/** `gone`: the device no longer receives pushes, so its subscription should be forgotten. */
export type PushOutcome = 'sent' | 'gone' | 'failed';

export async function sendPush(key: VapidKey, endpoint: string, now: Date): Promise<PushOutcome> {
  if (!isPushEndpoint(endpoint, PUSH_ORIGINS)) return 'gone';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${await vapidToken(key, endpoint, now)}, k=${key.publicKey}`,
      // A reminder that could not be delivered in 4 hours is no longer useful.
      TTL: String(4 * 60 * 60),
      Urgency: 'normal',
    },
    body: '',
  });
  if (response.ok) return 'sent';
  return response.status === 404 || response.status === 410 ? 'gone' : 'failed';
}
