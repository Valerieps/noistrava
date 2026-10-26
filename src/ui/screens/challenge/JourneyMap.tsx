// The journey on a map: the stored route on OpenStreetMap, the stretch already walked (whole, or
// one color per Senhora), the stops, where the group is and where the programmed pace would put it.
import { useState } from 'react';
import type { ChallengeView } from '../../../application/api-contract';
import { measureRoute, pointAt, stretch } from '../../../domain/challenge/journey-map';
import { secondsToKm } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { formatKm } from '../../format';
import { RouteMap, type MapLine } from '../../map/RouteMap';
import { TONES } from '../../palette';
import { senhorasOf } from './Ranking';

export function JourneyMap({ challenge, programmedMeters }: { challenge: ChallengeView; programmedMeters: number }) {
  const [perSenhora, setPerSenhora] = useState(false);
  const journey = challenge.journey!;
  const route = measureRoute(journey);
  const done = journey.progressMeters;

  const lines: MapLine[] = [{ points: stretch(route, done, journey.distanceMeters), tone: 'left' }];
  if (perSenhora) {
    let from = 0;
    senhorasOf(challenge.members)
      .filter((m) => m.totalSeconds > 0)
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .forEach((m, i) => {
        const to = Math.min(journey.distanceMeters, from + secondsToKm(m.totalSeconds) * 1000);
        lines.push({ points: stretch(route, from, to), tone: `tone-${i % TONES.length}` });
        from = to;
      });
  } else if (done > 0) {
    lines.push({ points: stretch(route, 0, done), tone: 'walked' });
  }

  const stops = [{ ...journey.start, distanceMeters: 0 }, ...journey.stops, { ...journey.end, distanceMeters: journey.distanceMeters }];
  const places = stops.map((p) => ({ name: p.name, point: pointAt(route, p.distanceMeters), reached: p.distanceMeters <= done }));
  const next = stops.find((p) => p.distanceMeters > done);
  const label = next ? strings.journey.here(formatKm((next.distanceMeters - done) / 1000), next.name) : strings.journey.arrivedHere(journey.end.name);
  const ghost = programmedMeters > done ? { point: pointAt(route, Math.min(programmedMeters, journey.distanceMeters)), label: strings.journey.programmed } : undefined;

  return (
    <RouteMap
      route={journey.route}
      lines={lines}
      places={places}
      here={{ point: pointAt(route, done), label }}
      ghost={ghost}
      label={strings.journey.mapLabel(journey.start.name, journey.end.name)}
    >
      <button type="button" className="map-toggle" aria-pressed={perSenhora} onClick={() => setPerSenhora(!perSenhora)}>
        {strings.journey.perSenhora}
      </button>
    </RouteMap>
  );
}
