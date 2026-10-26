// Where a distance along the journey's stored route falls (docs/spec/desafio-horas.md, "Jornada"):
// the group's position, the programmed one, the stops and the stretches walked. Pure; the map only
// draws what this returns.
import type { Journey } from './challenge';

export type Point = readonly [number, number];

const EARTH_RADIUS_M = 6_371_000;

function haversine(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface MeasuredRoute {
  /** The route as [lat, lng] points. */
  readonly points: readonly Point[];
  /** How far along the route each point sits, scaled so the last one is the journey's distance. */
  readonly along: readonly number[];
}

/** The route with the distance at each point, so a distance along it can be placed on the map. */
export function measureRoute(journey: Pick<Journey, 'route' | 'distanceMeters'>): MeasuredRoute {
  const route = journey.route;
  const raw = [0];
  for (let i = 1; i < route.length; i++) raw.push(raw[i - 1] + haversine(route[i - 1], route[i]));
  const factor = raw[raw.length - 1] > 0 ? journey.distanceMeters / raw[raw.length - 1] : 0;
  return { points: route, along: raw.map((d) => d * factor) };
}

/** The point `meters` along the route. */
export function pointAt(route: MeasuredRoute, meters: number): Point {
  const { points, along } = route;
  if (meters <= 0) return points[0];
  for (let i = 1; i < points.length; i++) {
    if (meters <= along[i]) {
      const span = along[i] - along[i - 1];
      const t = span > 0 ? (meters - along[i - 1]) / span : 0;
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t];
    }
  }
  return points[points.length - 1];
}

/** The stretch of the route between two distances. */
export function stretch(route: MeasuredRoute, from: number, to: number): Point[] {
  if (to <= from) return [];
  const inside = route.points.filter((_, i) => route.along[i] > from && route.along[i] < to);
  return [pointAt(route, from), ...inside, pointAt(route, to)];
}
