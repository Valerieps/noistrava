// Draws the journey's stored route on a plain SVG (docs/spec/desafio-horas.md, "Jornada"): projects
// the [lat, lng] points to a box and finds where a distance along the route falls. Pure; the screen
// only renders what this returns.
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

export interface ProjectedRoute {
  /** The route in box coordinates. */
  readonly points: readonly Point[];
  /** How far along the route each point sits, scaled so the last one is the journey's distance. */
  readonly along: readonly number[];
  readonly project: (lat: number, lng: number) => Point;
}

/** Fits the route in a `width` × `height` box with `padding`, keeping its shape (equirectangular). */
export function projectRoute(journey: Pick<Journey, 'route' | 'distanceMeters'>, width: number, height: number, padding: number): ProjectedRoute {
  const route = journey.route;
  const lats = route.map((p) => p[0]);
  const lngs = route.map((p) => p[1]);
  const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
  const xs = lngs.map((lng) => lng * Math.cos(midLat));
  const minX = Math.min(...xs);
  const maxY = Math.max(...lats);
  const spanX = Math.max(Math.max(...xs) - minX, 1e-9);
  const spanY = Math.max(maxY - Math.min(...lats), 1e-9);
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const project = (lat: number, lng: number): Point => [offsetX + (lng * Math.cos(midLat) - minX) * scale, offsetY + (maxY - lat) * scale];

  const raw = [0];
  for (let i = 1; i < route.length; i++) raw.push(raw[i - 1] + haversine(route[i - 1], route[i]));
  const factor = raw[raw.length - 1] > 0 ? journey.distanceMeters / raw[raw.length - 1] : 0;
  return { points: route.map((p) => project(p[0], p[1])), along: raw.map((d) => d * factor), project };
}

/** The box point `meters` along the route. */
export function pointAt(route: ProjectedRoute, meters: number): Point {
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

/** The stretch of the route between two distances, as box points. */
export function stretch(route: ProjectedRoute, from: number, to: number): Point[] {
  if (to <= from) return [];
  const inside = route.points.filter((_, i) => route.along[i] > from && route.along[i] < to);
  return [pointAt(route, from), ...inside, pointAt(route, to)];
}

/** "x,y x,y" for an SVG polyline. */
export function svgPoints(points: readonly Point[]): string {
  return points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}
