// The journey's automatic stops (docs/spec/desafio-horas.md, "Jornada"): the app splits the route
// into equal stretches and, in each, picks the largest city near the route or, with no city, a
// tourist attraction. Pure; the server finds the candidates and calls this once per route.
import type { Journey, JourneyStop, Place } from './challenge';
import { measureRoute, type Point } from './journey-map';

/** One stop for every 25 km of route, at most 8. */
export const KM_PER_AUTO_STOP = 25;
export const MAX_AUTO_STOPS = 8;
/** A place counts as on the way when it is this close to the route. */
export const NEAR_ROUTE_METERS = 10_000;

/** A city of unknown size still beats a town of unknown size. */
const DEFAULT_POPULATION = { city: 100_000, town: 10_000 } as const;

export interface StopCandidate extends Place {
  readonly kind: 'city' | 'town' | 'attraction';
  readonly population: number | null;
}

export function autoStopCount(distanceMeters: number): number {
  return Math.max(0, Math.min(MAX_AUTO_STOPS, Math.floor(distanceMeters / 1000 / KM_PER_AUTO_STOP)));
}

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/** Where `p` falls on the route: how far along it, and how far off it, in meters. */
function project(points: readonly Point[], along: readonly number[], p: Point): { along: number; off: number } {
  // A flat projection around `p` is exact enough within the few kilometers that matter.
  const scaleX = Math.cos(p[0] * RAD) * EARTH_RADIUS_M * RAD;
  const scaleY = EARTH_RADIUS_M * RAD;
  const xy = (q: Point): [number, number] => [(q[1] - p[1]) * scaleX, (q[0] - p[0]) * scaleY];
  let best = { along: 0, off: Infinity };
  let a = xy(points[0]);
  for (let i = 1; i < points.length; i++) {
    const b = xy(points[i]);
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, (-a[0] * dx - a[1] * dy) / length));
    const off = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (off < best.off) best = { along: along[i - 1] + t * (along[i] - along[i - 1]), off };
    a = b;
  }
  return best;
}

function rank(candidate: StopCandidate): number {
  if (candidate.kind === 'attraction') return -1;
  return candidate.population ?? DEFAULT_POPULATION[candidate.kind];
}

/**
 * The stops for a route: `autoStopCount` stretches around evenly spaced points, each giving the
 * largest city or town within `NEAR_ROUTE_METERS` of the route, or else the attraction closest to
 * the stretch's middle. A stretch with neither has no stop, and no place is used twice.
 */
export function chooseStops(journey: Pick<Journey, 'start' | 'end' | 'route' | 'distanceMeters'>, candidates: readonly StopCandidate[]): JourneyStop[] {
  const count = autoStopCount(journey.distanceMeters);
  if (count === 0) return [];
  const route = measureRoute(journey);
  const step = journey.distanceMeters / (count + 1);
  const used = new Set([journey.start.name, journey.end.name]);
  const placed = candidates
    .map((c) => ({ candidate: c, ...project(route.points, route.along, [c.lat, c.lng]) }))
    .filter((c) => c.off <= NEAR_ROUTE_METERS);

  const stops: JourneyStop[] = [];
  for (let k = 1; k <= count; k++) {
    const middle = k * step;
    const inside = placed.filter((c) => !used.has(c.candidate.name) && Math.abs(c.along - middle) < step / 2);
    inside.sort((a, b) => rank(b.candidate) - rank(a.candidate) || Math.abs(a.along - middle) - Math.abs(b.along - middle));
    const best = inside[0];
    if (!best) continue;
    const distanceMeters = Math.round(best.along);
    if (distanceMeters <= 0 || distanceMeters >= journey.distanceMeters) continue;
    used.add(best.candidate.name);
    stops.push({ name: best.candidate.name, lat: best.candidate.lat, lng: best.candidate.lng, distanceMeters });
  }
  return stops;
}
