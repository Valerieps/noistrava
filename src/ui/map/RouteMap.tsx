// A route on OpenStreetMap tiles, drawn with Leaflet (ADR-009). It only draws what it receives:
// lines, places and markers, each in [lat, lng]. Labels go in as text nodes, never as HTML.
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Point } from '../../domain/challenge/journey-map';
import { strings } from '../../domain/strings';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** A stretch of the route; `tone` picks its look in global.css (`.route-<tone>`). */
export interface MapLine {
  readonly points: readonly Point[];
  readonly tone: string;
}

export interface MapPlace {
  readonly name: string;
  readonly point: Point;
  /** Reached places are filled. */
  readonly reached: boolean;
}

export interface MapMarker {
  readonly point: Point;
  readonly label: string;
}

interface Props {
  readonly route: readonly Point[];
  readonly lines: readonly MapLine[];
  readonly places: readonly MapPlace[];
  /** Where the group is. */
  readonly here?: MapMarker;
  /** Where the programmed pace would put it. */
  readonly ghost?: MapMarker;
  readonly label: string;
  /** A shorter map, for the challenge screen. */
  readonly compact?: boolean;
  readonly children?: ReactNode;
}

function text(content: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = content;
  return span;
}

export function RouteMap({ route, lines, places, here, ghost, label, compact = false, children }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: L.Map; layers: L.LayerGroup } | null>(null);

  useEffect(() => {
    const created = L.map(element.current!, { scrollWheelZoom: false, zoomSnap: 0.25 });
    created.attributionControl.setPrefix(false);
    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: strings.journey.attribution,
      // The tile servers refuse requests without a Referer; the app's own policy sends none.
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(created);
    map.current = { map: created, layers: L.layerGroup().addTo(created) };
    return () => {
      created.remove();
      map.current = null;
    };
  }, []);

  // Frame the route whenever it changes, not on every redraw of what is walked.
  useEffect(() => {
    if (route.length < 2) return;
    map.current?.map.fitBounds(L.latLngBounds(route.map((p): L.LatLngTuple => [p[0], p[1]])), { padding: [32, 32] });
  }, [route]);

  useEffect(() => {
    const layers = map.current?.layers;
    if (!layers) return;
    layers.clearLayers();
    for (const line of lines) {
      if (line.points.length < 2) continue;
      L.polyline(
        line.points.map((p): L.LatLngTuple => [p[0], p[1]]),
        { className: `route-${line.tone}`, interactive: false },
      ).addTo(layers);
    }
    for (const place of places) {
      L.circleMarker([place.point[0], place.point[1]], { radius: 6, className: place.reached ? 'map-place reached' : 'map-place', interactive: false })
        .bindTooltip(text(place.name), { permanent: true, direction: 'right', offset: [8, 0], className: 'map-label' })
        .addTo(layers);
    }
    if (ghost) {
      L.circleMarker([ghost.point[0], ghost.point[1]], { radius: 9, className: 'map-ghost', interactive: false })
        .bindTooltip(text(ghost.label), { permanent: true, direction: 'left', offset: [-10, 0], className: 'map-label' })
        .addTo(layers);
    }
    if (here) {
      L.circleMarker([here.point[0], here.point[1]], { radius: 16, className: 'map-here-halo', interactive: false }).addTo(layers);
      L.circleMarker([here.point[0], here.point[1]], { radius: 9, className: 'map-here-dot', interactive: false })
        .bindTooltip(text(here.label), { permanent: true, direction: 'top', offset: [0, -12], className: 'map-here' })
        .addTo(layers);
    }
  }, [lines, places, here, ghost]);

  return (
    <section className={compact ? 'map compact' : 'map'}>
      <div ref={element} className="map-canvas" role="img" aria-label={label} />
      {children}
    </section>
  );
}
