import { describe, expect, it } from 'vitest';
import {
  candidatesFromOverpass,
  journeyFromRoute,
  normalizeSearchQuery,
  parseRouteRequest,
  routeUrl,
  searchUrl,
  simplifyRoute,
  stopsQuery,
  suggestionsFromResponse,
  userAgent,
} from './openstreetmap';

const lisboa = { name: 'Lisboa', lat: 38.7223, lng: -9.1393 };
const sintra = { name: 'Sintra', lat: 38.8029, lng: -9.3817 };
const cascais = { name: 'Cascais', lat: 38.6979, lng: -9.4215 };

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

describe('walking route', () => {
  it('accepts the start and the end with the domain rules, ignoring stops sent by an old app', () => {
    expect(parseRouteRequest({ start: lisboa, end: cascais })).toEqual({ start: lisboa, end: cascais });
    expect(parseRouteRequest({ start: lisboa, end: cascais, stops: [sintra] })).toEqual({ start: lisboa, end: cascais });
    expect(parseRouteRequest({ start: lisboa, end: { name: '', lat: 0, lng: 0 } })).toBeNull();
    expect(parseRouteRequest({ start: lisboa })).toBeNull();
  });

  it('asks the FOSSGIS foot router for the whole geometry, in lng,lat order', () => {
    const url = new URL(routeUrl({ start: lisboa, end: cascais }));
    expect(url.origin).toBe('https://routing.openstreetmap.de');
    expect(url.pathname).toBe('/routed-foot/route/v1/foot/-9.139300,38.722300;-9.421500,38.697900');
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

  it('turns the answer into the journey, still without stops', () => {
    const body = {
      code: 'Ok',
      routes: [{ distance: 45_300.4, geometry: { coordinates: [[-9.1393, 38.7223], [-9.3817, 38.8029], [-9.4215, 38.6979]] } }],
    };
    expect(journeyFromRoute({ start: lisboa, end: cascais }, body)).toEqual({
      start: lisboa,
      end: cascais,
      stops: [],
      distanceMeters: 45_300,
      route: [[38.7223, -9.1393], [38.8029, -9.3817], [38.6979, -9.4215]],
    });
  });

  it('refuses an answer without a walking route', () => {
    const request = { start: lisboa, end: cascais };
    expect(journeyFromRoute(request, { code: 'NoRoute', routes: [] })).toBeNull();
    expect(journeyFromRoute(request, { code: 'Ok', routes: [{ distance: 10, geometry: { coordinates: [[0, 0]] } }] })).toBeNull();
    expect(journeyFromRoute(request, { code: 'Ok', routes: [{ distance: 0, geometry: { coordinates: [[0, 0], [1, 1]] } }] })).toBeNull();
    expect(journeyFromRoute(request, null)).toBeNull();
  });
});

describe('automatic stops (ADR-011)', () => {
  it('asks Overpass for cities, towns and famous attractions within 10 km of the route', () => {
    const query = stopsQuery([[38.7223, -9.1393], [38.6979, -9.4215]]);
    expect(query).toContain('node["place"~"^(city|town)$"]["name"](around:10000,38.72230,-9.13930,38.69790,-9.42150);');
    expect(query).toContain('["wikidata"]');
    expect(query).toContain('out tags center;');
  });

  it('reads each place with its Portuguese name, kind and population, skipping broken items', () => {
    const body = {
      elements: [
        { type: 'node', lat: 38.8, lon: -9.38, tags: { place: 'town', name: 'Sintra', population: '30 000' } },
        { type: 'node', lat: 48.85, lon: 2.35, tags: { place: 'city', name: 'Paris', 'name:pt': 'Paris' } },
        { type: 'way', center: { lat: 38.79, lon: -9.39 }, tags: { historic: 'castle', name: 'Castelo dos Mouros', population: '9' } },
        { type: 'node', lat: 1, lon: 1, tags: { tourism: 'museum' } },
        { type: 'way', tags: { tourism: 'museum', name: 'Sem centro' } },
      ],
    };
    expect(candidatesFromOverpass(body)).toEqual([
      { name: 'Sintra', lat: 38.8, lng: -9.38, kind: 'town', population: 30_000 },
      { name: 'Paris', lat: 48.85, lng: 2.35, kind: 'city', population: null },
      { name: 'Castelo dos Mouros', lat: 38.79, lng: -9.39, kind: 'attraction', population: null },
    ]);
    expect(candidatesFromOverpass({ remark: 'timeout' })).toEqual([]);
  });
});
