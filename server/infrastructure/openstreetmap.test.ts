import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  journeyFromRoute,
  normalizeSearchQuery,
  parseRouteRequest,
  planRoute,
  ROUTE_TIMEOUT_MS,
  routeUrl,
  searchUrl,
  simplifyRoute,
  suggestionsFromResponse,
  userAgent,
} from './openstreetmap';

const lisboa = { name: 'Lisboa', lat: 38.7223, lng: -9.1393 };
const sintra = { name: 'Sintra', lat: 38.8029, lng: -9.3817 };
const cascais = { name: 'Cascais', lat: 38.6979, lng: -9.4215 };
const porto = { name: 'Porto', lat: 41.1579, lng: -8.6291 };

describe('place search', () => {
  it('identifies the app, with the contact when there is one', () => {
    expect(userAgent('https://app.example', undefined)).toBe('Senhoras/1.0 (+https://app.example)');
    expect(userAgent('https://app.example', ' ana@example.com ')).toBe('Senhoras/1.0 (+https://app.example; ana@example.com)');
  });

  it('accepts a search of 2 to 120 characters', () => {
    expect(normalizeSearchQuery('  Belém   Lisboa ')).toBe('Belém Lisboa');
    expect(normalizeSearchQuery('a')).toBeNull();
    expect(normalizeSearchQuery('x'.repeat(121))).toBeNull();
    expect(normalizeSearchQuery(3)).toBeNull();
  });

  it('asks Nominatim for a few results in Portuguese', () => {
    const url = new URL(searchUrl('Belém'));
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'Belém', format: 'jsonv2', limit: '5', 'accept-language': 'pt-BR' });
  });

  it('reads a short name, the address and the coordinates, skipping broken items', () => {
    const body = [
      { name: 'Belém', display_name: 'Belém, Lisboa, Portugal', lat: '38.70', lon: '-9.21' },
      { name: '', display_name: 'Rua Augusta, Lisboa', lat: '38.71', lon: '-9.13' },
      { display_name: 'Sem coordenadas' },
      'nope',
    ];
    expect(suggestionsFromResponse(body)).toEqual([
      { name: 'Belém', detail: 'Belém, Lisboa, Portugal', lat: 38.7, lng: -9.21 },
      { name: 'Rua Augusta', detail: 'Rua Augusta, Lisboa', lat: 38.71, lng: -9.13 },
    ]);
    expect(suggestionsFromResponse({ error: 'x' })).toEqual([]);
    const long = suggestionsFromResponse([{ name: 'x'.repeat(200), display_name: 'y'.repeat(200), lat: '0', lon: '0' }])[0];
    expect(long.name.length).toBe(120);
    expect(long.detail.endsWith('…')).toBe(true);
  });
});

describe('driving route', () => {
  it('accepts the places with the domain rules, keeping the stops in order', () => {
    expect(parseRouteRequest({ start: lisboa, end: cascais, stops: [] })).toEqual({ start: lisboa, end: cascais, stops: [] });
    expect(parseRouteRequest({ start: lisboa, end: cascais, stops: [sintra, porto] })).toEqual({ start: lisboa, end: cascais, stops: [sintra, porto] });
    expect(parseRouteRequest({ start: lisboa, end: cascais, stops: [sintra, sintra] })).toBeNull();
    expect(parseRouteRequest({ start: lisboa, end: { name: '', lat: 0, lng: 0 }, stops: [] })).toBeNull();
    expect(parseRouteRequest({ start: lisboa, end: cascais })).toBeNull();
    expect(parseRouteRequest({ start: lisboa, end: cascais, stops: Array.from({ length: 21 }, (_, i) => ({ ...sintra, name: `P${i}` })) })).toBeNull();
  });

  it('asks the FOSSGIS car router for the whole geometry, in lng,lat order', () => {
    const url = new URL(routeUrl({ start: lisboa, end: cascais, stops: [sintra] }));
    expect(url.origin).toBe('https://routing.openstreetmap.de');
    expect(url.pathname).toBe('/routed-car/route/v1/driving/-9.139300,38.722300;-9.381700,38.802900;-9.421500,38.697900');
    expect(url.searchParams.get('overview')).toBe('full');
    expect(url.searchParams.get('geometries')).toBe('geojson');
  });

  it('keeps the shape of the route with fewer points', () => {
    const line = Array.from({ length: 5000 }, (_, i) => [i / 1000, Math.sin(i / 300)] as [number, number]);
    const simple = simplifyRoute(line, 500);
    expect(simple.length).toBeLessThanOrEqual(500);
    expect(simple[0]).toEqual([0, 0]);
    expect(simple[simple.length - 1]).toEqual([4.999, Math.round(Math.sin(4999 / 300) * 1e5) / 1e5]);
    // A straight line needs only its ends.
    expect(simplifyRoute([[0, 0], [0, 1], [0, 2]])).toEqual([[0, 0], [0, 2]]);
  });

  it('turns the answer into the journey, each stop where its leg ends', () => {
    const body = {
      code: 'Ok',
      routes: [
        {
          distance: 45_300.4,
          legs: [{ distance: 28_100.2 }, { distance: 17_200.2 }],
          geometry: { coordinates: [[-9.1393, 38.7223], [-9.3817, 38.8029], [-9.4215, 38.6979]] },
        },
      ],
    };
    expect(journeyFromRoute({ start: lisboa, end: cascais, stops: [sintra] }, body)).toEqual({
      start: lisboa,
      end: cascais,
      stops: [{ ...sintra, distanceMeters: 28_100 }],
      distanceMeters: 45_300,
      route: [[38.7223, -9.1393], [38.8029, -9.3817], [38.6979, -9.4215]],
    });
  });

  it('refuses an answer without a driving route', () => {
    const request = { start: lisboa, end: cascais, stops: [] };
    expect(journeyFromRoute(request, { code: 'NoRoute', routes: [] })).toBeNull();
    expect(journeyFromRoute(request, { code: 'Ok', routes: [{ distance: 10, legs: [{ distance: 10 }], geometry: { coordinates: [[0, 0]] } }] })).toBeNull();
    expect(journeyFromRoute(request, { code: 'Ok', routes: [{ distance: 0, legs: [{ distance: 0 }], geometry: { coordinates: [[0, 0], [1, 1]] } }] })).toBeNull();
    // A stop the route passes at its very start does not fall inside it.
    const atStart = { start: lisboa, end: cascais, stops: [sintra] };
    expect(journeyFromRoute(atStart, { code: 'Ok', routes: [{ distance: 10, legs: [{ distance: 0 }, { distance: 10 }], geometry: { coordinates: [[0, 0], [1, 1]] } }] })).toBeNull();
    expect(journeyFromRoute(atStart, { code: 'Ok', routes: [{ distance: 10, legs: [{ distance: 10 }], geometry: { coordinates: [[0, 0], [1, 1]] } }] })).toBeNull();
    expect(journeyFromRoute(request, null)).toBeNull();
  });
});

describe('waiting for the public servers', () => {
  /** A server that never answers until the request is given up. */
  function silent(init?: RequestInit): Promise<Response> {
    return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up when the router does not answer in time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => silent(init));
    const planned = planRoute({ start: lisboa, end: porto, stops: [] }, 'test');
    const failed = expect(planned).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(ROUTE_TIMEOUT_MS);
    await failed;
  });
});
