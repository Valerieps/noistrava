import type { Group } from './group-object';

/** Bindings and settings from wrangler.jsonc; secrets are set with `wrangler secret put`. */
export interface Env {
  readonly ASSETS: Fetcher;
  readonly GROUP: DurableObjectNamespace<Group>;
  readonly GOOGLE_CLIENT_ID: string;
  readonly GOOGLE_CLIENT_SECRET: string;
  /** Comma-separated. Only used while the group has no admin at all. */
  readonly BOOTSTRAP_ADMIN_EMAILS: string;
  /** Strava (ADR-008). Previews have no secrets, so connecting answers `unavailable` there. */
  readonly STRAVA_CLIENT_ID: string;
  readonly STRAVA_CLIENT_SECRET?: string;
  /** 32 random bytes in base64: the AES-GCM key for the tokens at rest. */
  readonly STRAVA_TOKEN_KEY?: string;
  /** "1" turns on the test sign-in on localhost (ADR-007). Only ever set in `.dev.vars`. */
  readonly DEV_SIGN_IN?: string;
}
