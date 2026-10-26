// Sign-in without Google, for testing on this computer only (ADR-007). It goes through the same
// invite and bootstrap rules as Google; it only skips proving who owns the e-mail.
import { isPlausibleEmail, normalizeEmail } from '../../src/domain/group/email';
import type { GoogleProfile } from '../application/members';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** On only when `.dev.vars` says DEV_SIGN_IN=1 and the request is to this computer. */
export function devSignInAllowed(flag: string | undefined, url: URL): boolean {
  return flag === '1' && LOCAL_HOSTS.has(url.hostname);
}

/** The profile a test sign-in stands for, or null when the e-mail is not one. */
export function devProfile(form: { email?: unknown; name?: unknown }): GoogleProfile | null {
  if (typeof form.email !== 'string') return null;
  const email = normalizeEmail(form.email);
  if (!isPlausibleEmail(email)) return null;
  const name = typeof form.name === 'string' && form.name.trim() ? form.name : email.split('@')[0];
  return { sub: `dev:${email}`, email, name, picture: null };
}
