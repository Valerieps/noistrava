// The journey on a map: the stored route drawn as SVG, the stretch already walked (whole, or one
// color per Senhora), the stops, where the group is and where the programmed pace would put it.
import { useState } from 'react';
import type { ChallengeView } from '../../../application/api-contract';
import { pointAt, projectRoute, stretch, svgPoints } from '../../../domain/challenge/journey-map';
import { secondsToKm } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { formatKm } from '../../format';
import { TONES } from '../../palette';
import { senhorasOf } from './Ranking';

const W = 358;
const H = 420;
const PAD = 40;

export function JourneyMap({ challenge, programmedMeters }: { challenge: ChallengeView; programmedMeters: number }) {
  const [perSenhora, setPerSenhora] = useState(false);
  const journey = challenge.journey!;
  const route = projectRoute(journey, W, H, PAD);
  const done = journey.progressMeters;
  const here = pointAt(route, done);
  const ghost = pointAt(route, Math.min(programmedMeters, journey.distanceMeters));

  const segments: { points: string; color: string }[] = [];
  if (perSenhora) {
    let from = 0;
    senhorasOf(challenge.members)
      .filter((m) => m.totalSeconds > 0)
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .forEach((m, i) => {
        const to = Math.min(journey.distanceMeters, from + secondsToKm(m.totalSeconds) * 1000);
        segments.push({ points: svgPoints(stretch(route, from, to)), color: TONES[i % TONES.length] });
        from = to;
      });
  } else if (done > 0) {
    segments.push({ points: svgPoints(stretch(route, 0, done)), color: 'var(--color-brand)' });
  }

  const places = [{ ...journey.start, distanceMeters: 0 }, ...journey.stops, { ...journey.end, distanceMeters: journey.distanceMeters }];
  const next = places.find((p) => p.distanceMeters > done);
  const label = next ? strings.journey.here(formatKm((next.distanceMeters - done) / 1000), next.name) : strings.journey.arrivedHere(journey.end.name);
  const labelOnLeft = here[0] > W / 2;

  return (
    <section className="map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={strings.journey.mapLabel(journey.start.name, journey.end.name)}>
        <polyline points={svgPoints(stretch(route, done, journey.distanceMeters))} fill="none" stroke="var(--color-ghost-strong)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 9" />
        {segments.map((s, i) => (
          <polyline key={i} points={s.points} fill="none" stroke={s.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {places.map((p) => {
          const [x, y] = pointAt(route, p.distanceMeters);
          const right = x < W - 90;
          return (
            <g key={`${p.name}-${p.distanceMeters}`}>
              <rect x={x - 6} y={y - 6} width="12" height="12" rx="3" fill={p.distanceMeters <= done ? 'var(--color-brand)' : 'var(--color-surface)'} stroke="var(--color-text)" strokeWidth="2" />
              <text x={right ? x + 14 : x - 14} y={y + 4} textAnchor={right ? 'start' : 'end'} fontSize="12" fontWeight="700" fill="var(--color-text)">
                {p.name}
              </text>
            </g>
          );
        })}
        {programmedMeters > done && (
          <>
            <circle cx={ghost[0]} cy={ghost[1]} r="9" fill="none" stroke="var(--color-text)" strokeWidth="2" strokeDasharray="3 3" />
            <text x={ghost[0] + 14} y={ghost[1] + 4} fontSize="11" fill="var(--color-text)">
              {strings.journey.programmed}
            </text>
          </>
        )}
        <circle cx={here[0]} cy={here[1]} r="16" fill="var(--color-accent)" opacity=".25" />
        <circle cx={here[0]} cy={here[1]} r="9" fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="3" />
      </svg>
      <div
        className="map-here"
        style={
          labelOnLeft
            ? { right: `${((W - here[0] + 16) / W) * 100}%`, top: `${(here[1] / H) * 100}%` }
            : { left: `${((here[0] + 16) / W) * 100}%`, top: `${(here[1] / H) * 100}%` }
        }
      >
        {label}
      </div>
      <button type="button" className="map-toggle" aria-pressed={perSenhora} onClick={() => setPerSenhora(!perSenhora)}>
        {strings.journey.perSenhora}
      </button>
      <div className="map-credit">{strings.journey.attribution}</div>
    </section>
  );
}
