// Small WebCrypto helpers. WebCrypto exists in Workers and in Node, so these run in tests too.

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64Url(new Uint8Array(digest));
}

/** Compares secrets without leaking, through timing, how much of them matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function aesKey(keyBase64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyBase64.trim());
  if (raw.length !== 32) throw new Error('The key must be 32 bytes in base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-GCM with a fresh IV; the result is `<iv>.<ciphertext>` in base64url. */
export async function encryptText(keyBase64: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyBase64), new TextEncoder().encode(text));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(sealed))}`;
}

export async function decryptText(keyBase64: string, sealed: string): Promise<string> {
  const [iv, data] = sealed.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await aesKey(keyBase64), fromBase64Url(data));
  return new TextDecoder().decode(plain);
}
