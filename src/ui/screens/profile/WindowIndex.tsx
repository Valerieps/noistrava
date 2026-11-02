// "Índice de Aproveitamento" on the profile: the index on each of the last 30 days, over the
// green, yellow and red zones, with a message for today's zone.
import { useId, useState } from 'react';
import type { CalendarDate } from '../../../domain/time/zones';
import { strings } from '../../../domain/strings';
import { GREEN_FROM, indexSeries, indexZone, YELLOW_FROM } from '../../../domain/tracking/window-index';
import { formatShortDay } from '../../format';
import { InfoIcon } from '../../icons';

const W = 320;
const LEFT = 30;
const RIGHT = 6;
const TOP = 6;
const BOTTOM = 136;
const y = (percent: number) => TOP + ((100 - percent) / 100) * (BOTTOM - TOP);
const ZONES = [
  ['green', 100, GREEN_FROM],
  ['yellow', GREEN_FROM, YELLOW_FROM],
  ['red', YELLOW_FROM, 0],
] as const;

export function WindowIndex({ days, today }: { days: readonly { date: CalendarDate }[]; today: CalendarDate }) {
  const t = strings.tracking;
  const [open, setOpen] = useState(false);
  const infoId = useId();
  const points = indexSeries(
    days.map((d) => d.date),
    today,
  );
  if (points.length === 0) return null;

  const now = points[points.length - 1];
  const zone = indexZone(now.percent);
  const x = (i: number) => (points.length === 1 ? (LEFT + W - RIGHT) / 2 : LEFT + (i / (points.length - 1)) * (W - LEFT - RIGHT));
  const muted = 'var(--color-text-muted)';

  return (
    <section className="sheet-section">
      <div className="index-head">
        <h2 className="d">{t.indexTitle}</h2>
        <button type="button" className="icon-button index-info" aria-label={t.indexAbout} aria-expanded={open} aria-controls={infoId} onClick={() => setOpen(!open)}>
          <InfoIcon />
        </button>
      </div>
      {open && (
        <p id={infoId} className="index-info-text">
          {t.indexInfo}
        </p>
      )}
      <div className="index-now">
        <span className={`d index-percent ${zone}`}>{now.percent}%</span>
        <span className="small">{zone === 'yellow' ? t.indexMessage.yellow(now.longestPause) : t.indexMessage[zone]()}</span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${BOTTOM + 4}`} role="img" aria-label={t.indexChartLabel(now.percent)}>
          {ZONES.map(([name, from, to]) => (
            <rect key={name} x={LEFT} y={y(from)} width={W - LEFT - RIGHT} height={y(to) - y(from)} fill={`var(--color-zone-${name})`} fillOpacity="0.14" />
          ))}
          {[100, GREEN_FROM, YELLOW_FROM, 0].map((p) => (
            <text key={p} x={LEFT - 6} y={y(p) + 4} fontSize="10" textAnchor="end" fill={muted}>
              {p}%
            </text>
          ))}
          <polyline points={points.map((p, i) => `${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(' ')} fill="none" stroke="var(--color-text)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(points.length - 1)} cy={y(now.percent)} r="4.5" fill="var(--color-text)" />
        </svg>
        <div className="progress-notes" style={{ paddingLeft: `${(LEFT / W) * 100}%` }}>
          <span>{formatShortDay(points[0].date)}</span>
          <span>{t.indexToday}</span>
        </div>
      </div>
    </section>
  );
}
