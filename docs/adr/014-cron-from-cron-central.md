# ADR-014: Cron from the central Worker `cron-central`

**Status:** Accepted
**Date:** 2026-11-16
**Decision:** This Worker has no cron trigger. `wrangler.jsonc` sets `"triggers": { "crons": [] }`
and there is no `scheduled()` handler. The Worker `cron-central` runs every 5 minutes and calls the
named entrypoint `Cron` (`server/entry/worker.ts`) through a service binding; `Cron.tick()` runs
`runCron`: `Group.tick()`, `sendReminders`, then `runStravaBackfills` when Strava is set up.
**Why:** All the owner's Workers keep their schedules in one place, so cadence and failures are
seen in one Worker. An empty list is needed instead of removing the key: deleting `triggers` does
not remove the schedule on Cloudflare.
**Alternatives:** Keeping a cron per Worker (what ADR-004 did): works, but is scattered.
