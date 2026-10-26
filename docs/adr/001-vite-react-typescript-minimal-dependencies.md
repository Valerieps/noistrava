# ADR-001: Vite + React + TypeScript, minimal dependencies

**Status:** Accepted
**Date:** 2026-10-21
**Decision:** Runtime dependencies are React and React DOM only. Build and test tooling: Vite,
TypeScript and Vitest; for the server, `wrangler` (local Worker, bundling, deploy) and
`@cloudflare/workers-types`. All versions are pinned exactly and installed with `npm ci`. The
Worker uses no npm package: Google sign-in and hashing use WebCrypto. Server tests run on Node's
built-in `node:sqlite`, the same SQLite engine as the Durable Object. No lint tool by default:
`src/security.test.ts` covers the security rules and `tsc` the strictness.
**Why:** Every dependency is supply-chain risk and upkeep (`docs/SEGURANCA.md`). WebCrypto exists
in Workers and in Node, so the same code runs in production and in tests.
