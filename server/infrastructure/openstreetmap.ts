// The journey's place search, driving route and automatic stops (ADR-009, ADR-011): Nominatim, the
// FOSSGIS OSRM server and Overpass, called only by the Worker when the creator asks, with an
// identifying User-Agent as their usage policies require. Nothing here is called again while a
// challenge runs.
import type { PlaceSuggestion } from '../../src/application/api-contract';
import { parseJourney, type Journey, type Place } from '../../src/domain/challenge/challenge';
import { NEAR_ROUTE_METERS, autoStopCount, chooseStops, type StopCandidate } from '../../src/domain/challenge/journey-stops';

const SEARCH = 'https://nominatim.openstreetmap.org/search';
const ROUTE = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

export const SEARCH_QUERY_MAX_LENGTH = 120;
const SEARCH_RESULTS = 5;
const PLACE_NAME_MAX_LENGTH = 120;
/** Below the domain's limit, so the stored route stays small. */
const ROUTE_POINTS_TARGET = 1_000;
/**
 * How long each public server gets to answer. Overpass, when busy, takes a minute or more and then
 * often answers nothing; without a limit the creator sat on "Calculando…" all that time.
 */
export const SEARCH_TIMEOUT_MS = 10_000;
export const ROUTE_TIMEOUT_MS = 15_000;
export const STOPS_TIMEOUT_MS = 15_000;

/** "Senhoras (+https://the-app; contact)": who to reach when the group misuses the service. */
export function userAgent(origin: string, contact: string | undefined): string {
  const extra = contact?.trim() ? `; ${contact.trim()}` : '';
  return `Senhoras/1.0 (+${origin}${extra})`;
}

/** The search text, trimmed; null when empty or too long. */
export function normalizeSearchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean.length >= 2 && clean.length <= SEARCH_QUERY_MAX_LENGTH ? clean : null;
}

export function searchUrl(query: string): string {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: String(SEARCH_RESULTS), 'accept-language': 'pt-BR' });
  return `${SEARCH}?${params}`;
}

function shorten(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= PLACE_NAME_MAX_LENGTH ? clean : `${clean.slice(0, PLACE_NAME_MAX_LENGTH - 1).trimEnd()}…`;
}

/** Reads Nominatim's answer: a short name, the full address as detail, and the coordinates. */
export function suggestionsFromResponse(body: unknown): PlaceSuggestion[] {
  if (!Array.isArray(body)) return [];
  const suggestions: PlaceSuggestion[] = [];
  for (const item of body as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { name, display_name, lat, lon } = item as Record<string, unknown>;
    const latitude = typeof lat === 'string' ? Number(lat) : NaN;
    const longitude = typeof lon === 'string' ? Number(lon) : NaN;
    if (typeof display_name !== 'string' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const short = typeof name === 'string' && name.trim() ? name : display_name.split(',')[0];
    if (!short.trim()) continue;
    suggestions.push({ name: shorten(short), detail: shorten(display_name), lat: latitude, lng: longitude });
  }
  return suggestions;
}

/** Fetches and reads the JSON answer; throws when it takes longer than `ms`. */
async function fetchJson(url: string, init: RequestInit, ms: number): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error(`no answer within ${ms} ms`);
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPlaces(query: string, agent: string): Promise<PlaceSuggestion[] | null> {
  const { response, body } = await fetchJson(searchUrl(query), { headers: { 'User-Agent': agent, Accept: 'application/json' } }, SEARCH_TIMEOUT_MS);
  if (!response.ok) return null;
  return suggestionsFromResponse(body);
}

/** What the creator sends: the start and the end. The app chooses the stops (ADR-011). */
export interface RouteRequest {
  readonly start: Place;
  readonly end: Place;
}

export function parseRouteRequest(value: unknown): RouteRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  // The domain's own place rules, through a journey with a placeholder route.
  const probe = parseJourney({
    start: raw.start,
    end: raw.end,
    stops: [],
    distanceMeters: 1,
    route: [
      [0, 0],
      [0, 0],
    ],
  });
  if (!probe) return null;
  const place = ({ name, lat, lng }: Place): Place => ({ name, lat, lng });
  return { start: place(probe.start), end: place(probe.end) };
}

export function routeUrl(request: RouteRequest): string {
  const points = [request.start, request.end].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const params = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'false' });
  return `${ROUTE}/${points}?${params}`;
}

/** Perpendicular distance of `p` from the segment a–b, in degrees (enough to simplify a line). */
function offset(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker: drops the points closer than `tolerance` to the line, keeping both ends. */
function douglasPeucker(points: readonly (readonly [number, number])[], tolerance: number): [number, number][] {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = offset(points[i], points[first], points[last]);
      if (d > worst) [worst, index] = [d, i];
    }
    if (index !== -1 && worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1).map((p) => [p[0], p[1]]);
}

/** The route with at most `maxPoints` points, rounded to about a meter. */
export function simplifyRoute(points: readonly (readonly [number, number])[], maxPoints = ROUTE_POINTS_TARGET): [number, number][] {
  const round = (p: readonly [number, number]): [number, number] => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
  let tolerance = 1e-5;
  let result = douglasPeucker(points, tolerance);
  while (result.length > maxPoints) {
    tolerance *= 2;
    result = douglasPeucker(points, tolerance);
  }
  return result.map(round);
}

/**
 * Reads OSRM's answer into the journey to store, still without stops: the simplified route as
 * [lat, lng] and the total distance. Null when there is no driving route.
 */
export function journeyFromRoute(request: RouteRequest, body: unknown): Journey | null {
  if (typeof body !== 'object' || body === null) return null;
  const { code, routes } = body as { code?: unknown; routes?: unknown };
  if (code !== 'Ok' || !Array.isArray(routes) || routes.length === 0) return null;
  const route = routes[0] as { distance?: unknown; geometry?: { coordinates?: unknown } };
  const coordinates = route.geometry?.coordinates;
  if (typeof route.distance !== 'number' || !Array.isArray(coordinates)) return null;

  const points: [number, number][] = [];
  for (const c of coordinates as unknown[]) {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
    points.push([c[1], c[0]]);
  }
  if (points.length < 2) return null;
  return parseJourney({ start: request.start, end: request.end, stops: [], distanceMeters: Math.round(route.distance), route: simplifyRoute(points) });
}

/** Enough points for Overpass to follow the route within a few hundred meters. */
const OVERPASS_LINE_POINTS = 150;

/**
 * The Overpass query for the places within `NEAR_ROUTE_METERS` of the route: cities and towns, and
 * attractions famous enough to have a Wikidata entry.
 */
export function stopsQuery(route: readonly (readonly [number, number])[]): string {
  const line = simplifyRoute(route, OVERPASS_LINE_POINTS)
    .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join(',');
  const near = `(around:${NEAR_ROUTE_METERS},${line})`;
  return [
    `[out:json][timeout:${STOPS_TIMEOUT_MS / 1000}];`,
    '(',
    `node["place"~"^(city|town)$"]["name"]${near};`,
    `nwr["tourism"~"^(attraction|museum|viewpoint)$"]["wikidata"]["name"]${near};`,
    `nwr["historic"~"^(castle|monument|ruins|archaeological_site)$"]["wikidata"]["name"]${near};`,
    ');',
    'out tags center;',
  ].join('\n');
}

function population(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s.,]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** Reads Overpass's answer: each place's name (in Portuguese when there is one), kind and size. */
export function candidatesFromOverpass(body: unknown): StopCandidate[] {
  const elements = typeof body === 'object' && body !== null ? (body as { elements?: unknown }).elements : null;
  if (!Array.isArray(elements)) return [];
  const candidates: StopCandidate[] = [];
  for (const item of elements as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { lat, lon, center, tags } = item as { lat?: unknown; lon?: unknown; center?: { lat?: unknown; lon?: unknown }; tags?: Record<string, unknown> };
    const latitude = typeof lat === 'number' ? lat : center?.lat;
    const longitude = typeof lon === 'number' ? lon : center?.lon;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !tags) continue;
    const name = [tags['name:pt'], tags.name].find((n): n is string => typeof n === 'string' && n.trim() !== '');
    if (!name) continue;
    const kind = tags.place === 'city' || tags.place === 'town' ? tags.place : 'attraction';
    candidates.push({ name: shorten(name), lat: latitude, lng: longitude, kind, population: kind === 'attraction' ? null : population(tags.population) });
  }
  return candidates;
}

/** The places near the route, or null when Overpass refuses; throws when it does not answer in time. */
async function findCandidates(journey: Journey, agent: string): Promise<StopCandidate[] | null> {
  const { response, body } = await fetchJson(
    OVERPASS,
    {
      method: 'POST',
      headers: { 'User-Agent': agent, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: stopsQuery(journey.route) }),
    },
    STOPS_TIMEOUT_MS,
  );
  if (!response.ok) return null;
  return candidatesFromOverpass(body);
}

/**
 * The driving route, then its stops. `invalid` when OSRM answers but finds no usable driving route;
 * `unavailable` when it is down; throws when it does not answer in time. When Overpass fails or
 * is slow, the journey goes on without stops.
 */
export async function planRoute(
  request: RouteRequest,
  agent: string,
): Promise<{ ok: true; journey: Journey } | { ok: false; error: 'invalid' | 'unavailable' }> {
  const answer = await fetchJson(routeUrl(request), { headers: { 'User-Agent': agent, Accept: 'application/json' } }, ROUTE_TIMEOUT_MS);
  const { response } = answer;
  const body = answer.body as { code?: unknown } | null;
  // OSRM answers 400 with a code such as NoRoute when the places cannot be joined by road.
  if (!response.ok && !(response.status === 400 && typeof body?.code === 'string')) return { ok: false, error: 'unavailable' };
  const journey = journeyFromRoute(request, body);
  if (!journey) return { ok: false, error: 'invalid' };
  if (autoStopCount(journey.distanceMeters) === 0) return { ok: true, journey };

  const candidates = await findCandidates(journey, agent).catch((error: unknown) => {
    console.error('Overpass request failed', error instanceof Error ? error.message : 'unknown error');
    return null;
  });
  return { ok: true, journey: candidates ? { ...journey, stops: chooseStops(journey, candidates) } : journey };
}
