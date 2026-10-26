import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { ALLOWED_ORIGINS, IMAGE_ORIGINS } from './network-policy.ts';

// Strict CSP (docs/SEGURANCA.md, ADR-002). Injected only in production builds: the dev server
// needs a websocket for hot reload, which a closed `connect-src` would block. It is a meta tag
// rather than a header so it never applies to a service worker, if the app gets one.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  ["connect-src 'self'", ...ALLOWED_ORIGINS].join(' '),
  ["img-src 'self' data:", ...IMAGE_ORIGINS].join(' '),
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

// Lets tooling assign a port through the PORT environment variable.
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  // In development the API runs apart (`npm run dev:api`, wrangler on 8787); Vite forwards /api
  // to it, the live WebSocket included, and keeps the Host so cookies and origins match.
  server: { port, proxy: { '/api': { target: 'http://localhost:8787', ws: true } } },
  // Absolute base: the Worker serves the app at the root and deep links like /integrantes need it.
  base: '/',
  plugins: [react(), contentSecurityPolicy()],
  build: {
    // Keep everything as files under 'self'; never inline assets as scripts.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    // Claude Code sessions keep their own checkouts under .claude/worktrees; their tests are not ours.
    exclude: [...configDefaults.exclude, '.claude/**'],
    // The Worker's tests build the real Durable Object under Node (server/testing/worker.ts).
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./server/testing/cloudflare-workers.ts', import.meta.url)) },
  },
});
