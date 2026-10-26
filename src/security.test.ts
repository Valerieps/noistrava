import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGINS, IMAGE_ORIGINS, SERVER_ORIGINS } from '../network-policy.ts';
import { CONTENT_SECURITY_POLICY } from '../vite.config';

/**
 * Guards for docs/SEGURANCA.md, run by `npm test` and therefore by every build.
 * Scans the app and server source (not tests) for APIs that would break the rules.
 */

const SOURCE_ROOT = join(__dirname);
const SERVER_ROOT = join(__dirname, '..', 'server');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const NETWORK: [string, RegExp][] = [
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\b/],
];

const HTML_INJECTION: [string, RegExp][] = [
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
  ['innerHTML', /\.(inner|outer)HTML\s*=/],
  ['insertAdjacentHTML', /insertAdjacentHTML/],
  ['eval', /\beval\s*\(|new Function\s*\(/],
];

const EXTERNAL_URL = /https?:\/\/(?!www\.w3\.org\/)[a-z0-9.-]+\.[a-z]+/gi;

const files = sourceFiles(SOURCE_ROOT);
const serverFiles = sourceFiles(SERVER_ROOT).filter((file) => !relative(SERVER_ROOT, file).startsWith('testing'));
const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => relative(SOURCE_ROOT, file).split(sep).join('/');
// Requests are allowed only in the infrastructure layer.
const mayUseNetwork = (file: string) => rel(file).startsWith('infrastructure/');
const urlsOutside = (list: string[], allowed: readonly string[], base: string) =>
  list.flatMap((file) =>
    (read(file).match(EXTERNAL_URL) ?? [])
      .filter((url) => !allowed.some((origin) => url === origin || url.startsWith(`${origin}/`)))
      .map((url) => `${relative(base, file).split(sep).join('/')}: ${url}`),
  );

describe('security rules', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(HTML_INJECTION)('app source never uses %s', (_name, pattern) => {
    expect(files.filter((file) => pattern.test(read(file))).map(rel)).toEqual([]);
  });

  it.each(NETWORK)('only the allowed places use %s', (_name, pattern) => {
    expect(files.filter((file) => !mayUseNetwork(file) && pattern.test(read(file))).map(rel)).toEqual([]);
  });

  it('every URL in the app source points to an allowed origin', () => {
    expect(urlsOutside(files, [...ALLOWED_ORIGINS, ...IMAGE_ORIGINS], SOURCE_ROOT)).toEqual([]);
  });

  it('every URL in the server source points to a server origin', () => {
    expect(serverFiles.length).toBeGreaterThan(0);
    expect(urlsOutside(serverFiles, SERVER_ORIGINS, SERVER_ROOT)).toEqual([]);
  });

  it('the server never inserts HTML either', () => {
    expect(serverFiles.filter((file) => HTML_INJECTION.some(([, pattern]) => pattern.test(read(file))))).toEqual([]);
  });

  it('the production CSP opens connections only to its own origin and the allowed ones', () => {
    const rules = CONTENT_SECURITY_POLICY.split('; ');
    expect(rules.find((rule) => rule.startsWith('connect-src'))).toBe(["connect-src 'self'", ...ALLOWED_ORIGINS].join(' '));
    expect(rules.find((rule) => rule.startsWith('img-src'))).toBe(["img-src 'self' data:", ...IMAGE_ORIGINS].join(' '));
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });

  it('the test sign-in is never turned on in the deployed configuration (ADR-007)', () => {
    expect(read(join(__dirname, '..', 'wrangler.jsonc'))).not.toContain('DEV_SIGN_IN');
  });

  it('secrets never sit in the deployed configuration', () => {
    const config = read(join(__dirname, '..', 'wrangler.jsonc'));
    expect(config).not.toMatch(/GOOGLE_CLIENT_SECRET"\s*:/);
    expect(config).not.toMatch(/BOOTSTRAP_ADMIN_EMAILS"\s*:/);
    expect(config).not.toMatch(/STRAVA_CLIENT_SECRET"\s*:/);
    expect(config).not.toMatch(/STRAVA_TOKEN_KEY"\s*:/);
    expect(config).not.toMatch(/STRAVA_WEBHOOK_SECRET"\s*:/);
  });

  it('allowed origins are bare https origins', () => {
    for (const origin of [...ALLOWED_ORIGINS, ...IMAGE_ORIGINS, ...SERVER_ORIGINS]) {
      expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+(:\d+)?$/);
    }
  });
});
