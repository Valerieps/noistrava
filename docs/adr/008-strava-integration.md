# ADR-008: Strava integration with consent, webhook and encrypted tokens

**Status:** Accepted
**Date:** 2026-10-26
**Decision:** The Worker talks to `https://www.strava.com` (OAuth and API v3), listed in
`SERVER_ORIGINS`.
- **App:** one Strava API application, created on the owner's Strava account, with the athlete
  capacity raised to 10 in its settings. `STRAVA_CLIENT_ID` is a var; `STRAVA_CLIENT_SECRET`,
  `STRAVA_TOKEN_KEY` and `STRAVA_WEBHOOK_SECRET` are Worker secrets.
- **Consent first:** before the OAuth redirect, the member accepts that the group sees the start,
  total time and sport type of her activities (`docs/spec/strava.md`). The acceptance and its date
  are stored with the connection. Without it there is no connection, only manual logging.
- **Scopes:** `activity:read`, or `activity:read_all` when the member chooses to include private
  activities.
- **What is kept:** per activity only `id`, `start_date` (UTC) with `timezone`, `elapsed_time` and
  `sport_type`. Never the title, map, distance, photos or other athletes' data.
- **Tokens:** access and refresh tokens are encrypted with AES-GCM under `STRAVA_TOKEN_KEY` before
  they reach SQLite, and refreshed when expired.
- **Webhook:** one subscription for the app, at `/api/strava/webhook/<STRAVA_WEBHOOK_SECRET>`; the
  validation GET checks `hub.verify_token` with `constantTimeEqual`. Strava does not sign events, so
  an event is only a hint: the Worker fetches the activity from the API with the athlete's own token
  and never stores the event's content. `create` and `update` refetch, `delete` removes,
  deauthorization deletes the tokens and marks the connection inactive.
- **Backfill:** on connecting, and when a member joins a running challenge, the Worker fetches the
  member's activities from the challenge's start (`after=`).

**Why:** The Strava API Agreement (effective 2026-06-01) allows showing a user's Strava data only to
that user, and forbids sharing it with other users "without explicit consent". The whole point of
the app is the group seeing each Senhora's time, so explicit consent is the lawful path, and keeping
only the three fields the challenge needs limits what is shared. Aggregates (weekly totals) are
still Strava Data and the stats endpoint covers only fixed windows, so they do not avoid the rule.
**Alternatives:** Showing only the group total, hiding each member's activities (still Strava Data,
and the activity log is in the MVP); polling instead of the webhook (more requests, slower).
**Limits to watch:** 10 athletes without Strava's review. The consent reading is ours; if Strava
reads it differently, manual logging keeps the app working.
