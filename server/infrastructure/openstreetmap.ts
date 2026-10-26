// The journey's place search and walking route (ADR-009): Nominatim and the FOSSGIS OSRM server,
// called only by the Worker, once per creator action, with an identifying User-Agent as their
// usage policies require. Nothing here is called again while a challenge runs.
import type { PlaceSuggestion } from '../../src/application/api-contract';
import { MAX_STOPS, parseJourney, type Journey, type Place } from '../../src/domain/challenge/challenge';

const SEARCH = 'https://nominatim.openstreetmap.org/search';
const ROUTE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

export const SEARCH_QUERY_MAX_LENGTH = 120;
const SEARCH_RESULTS = 5;
const PLACE_NAME_MAX_LENGTH = 120;
/** Below the domain's limit, so the stored route stays small. */
const ROUTE_POINTS_TARGET = 1_000;

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

export async function searchPlaces(query: string, agent: string): Promise<PlaceSuggestion[] | null> {
  const response = await fetch(searchUrl(query), { headers: { 'User-Agent': agent, Accept: 'application/json' } });
  if (!response.ok) return null;
  return suggestionsFromResponse(await response.json().catch(() => null));
}

/** What the creator sends: the start, the end, and the stops in the order she walks them. */
export interface RouteRequest {
  readonly start: Place;
  readonly end: Place;
  readonly stops: readonly Place[];
}

export function parseRouteRequest(value: unknown): RouteRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.stops) || raw.stops.length > MAX_STOPS) return null;
  // The domain's own place rules, through a journey with placeholder distances.
  const probe = parseJourney({
    start: raw.start,
    end: raw.end,
    stops: (raw.stops as unknown[]).map((stop, i) => (typeof stop === 'object' && stop !== null ? { ...stop, distanceMeters: i + 1 } : stop)),
    distanceMeters: raw.stops.length + 2,
    route: [
      [0, 0],
      [0, 0],
    ],
  });
  if (!probe) return null;
  const place = ({ name, lat, lng }: Place): Place => ({ name, lat, lng });
  return { start: place(probe.start), end: place(probe.end), stops: probe.stops.map(place) };
}

export function routeUrl(request: RouteRequest): string {
  const points = [request.start, ...request.stops, request.end].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
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
 * Reads OSRM's answer into the journey to store: the simplified route as [lat, lng], the total
 * distance, and each stop at the distance where its leg ends. Null when there is no walking route
 * or a stop does not fall strictly inside it.
 */
export function journeyFromRoute(request: RouteRequest, body: unknown): Journey | null {
  if (typeof body !== 'object' || body === null) return null;
  const { code, routes } = body as { code?: unknown; routes?: unknown };
  if (code !== 'Ok' || !Array.isArray(routes) || routes.length === 0) return null;
  const route = routes[0] as { distance?: unknown; legs?: unknown; geometry?: { coordinates?: unknown } };
  const coordinates = route.geometry?.coordinates;
  if (typeof route.distance !== 'number' || !Array.isArray(route.legs) || !Array.isArray(coordinates)) return null;
  if (route.legs.length !== request.stops.length + 1) return null;

  const points: [number, number][] = [];
  for (const c of coordinates as unknown[]) {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
    points.push([c[1], c[0]]);
  }
  if (points.length < 2) return null;

  let along = 0;
  const stops = request.stops.map((stop, i) => {
    const leg = (route.legs as { distance?: unknown }[])[i];
    along += typeof leg?.distance === 'number' ? leg.distance : NaN;
    return { ...stop, distanceMeters: Math.round(along) };
  });
  return parseJourney({
    start: request.start,
    end: request.end,
    stops,
    distanceMeters: Math.round(route.distance),
    route: simplifyRoute(points),
  });
}

/** `invalid` when OSRM answers but finds no usable walking route; `unavailable` when it is down. */
export async function planRoute(
  request: RouteRequest,
  agent: string,
): Promise<{ ok: true; journey: Journey } | { ok: false; error: 'invalid' | 'unavailable' }> {
  const response = await fetch(routeUrl(request), { headers: { 'User-Agent': agent, Accept: 'application/json' } });
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  // OSRM answers 400 with a code such as NoRoute when the places cannot be joined on foot.
  if (!response.ok && !(response.status === 400 && typeof body?.code === 'string')) return { ok: false, error: 'unavailable' };
  const journey = journeyFromRoute(request, body);
  return journey ? { ok: true, journey } : { ok: false, error: 'invalid' };
}
