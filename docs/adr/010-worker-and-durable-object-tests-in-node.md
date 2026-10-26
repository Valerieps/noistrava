# ADR-010: Worker and Durable Object tests run in Node, without Miniflare

**Status:** Accepted
**Date:** 2026-10-26
**Decision:** `server/entry/worker.test.ts` sends `Request`s to the real Worker (`worker.fetch`,
`worker.scheduled`), which calls the real `Group` Durable Object. `server/testing/worker.ts` builds
both in one Node process: the Durable Object's storage is `node:sqlite` behind the runtime's
`sql.exec` / `transactionSync` API (refusing `BEGIN`/`COMMIT`, as the runtime does), live
connections are fake sockets that record what they receive, and every call to the Durable Object is
async with its arguments and result copied, as over RPC. `vite.config.ts` aliases
`cloudflare:workers` to `server/testing/cloudflare-workers.ts` in tests only. These files mix the
Workers and Node types, so `tsconfig.worker-test.json` typechecks them.
**Why:** The routes, status codes, cookies, live updates, cron and restarts had no tests. ADR-001
keeps dependencies to a minimum, and `@cloudflare/vitest-pool-workers` would add one tied to
specific Vitest versions. The use cases already run on `node:sqlite` (ADR-004), so the same engine
backs the Durable Object here.
**Alternatives:** `@cloudflare/vitest-pool-workers` (Miniflare): closer to production, but another
dependency, slower, and it pins the Vitest version. What it would catch that this does not: the
WebSocket upgrade (Node's `Response` refuses status 101, so only its refusals are tested) and real
RPC serialization limits.
