// The progress card: effective against programmed, as a bar, a ring or a curve (each viewer picks
// one and the device remembers it), and the sentence about the pace underneath.
import { useState, type ReactNode } from 'react';
import type { LogEntryView } from '../../../application/api-contract';
import { curvePoints, elapsedFraction, type Pace, type Period } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { BarViewIcon, CurveViewIcon, RingViewIcon } from '../../icons';

type View = 'bar' | 'ring' | 'curve';
const VIEWS: View[] = ['bar', 'ring', 'curve'];
const VIEW_KEY = 'senhoras.progressView';
const VIEW_ICONS: Record<View, ReactNode> = { bar: <BarViewIcon />, ring: <RingViewIcon />, curve: <CurveViewIcon /> };

function savedView(): View {
  try {
    const value = window.localStorage.getItem(VIEW_KEY);
    return VIEWS.includes(value as View) ? (value as View) : 'bar';
  } catch {
    return 'bar';
  }
}

export interface ProgressNumbers {
  /** The big number, e.g. "78h40" or "393 km". */
  readonly headline: string;
  /** Under it, e.g. "de 100h · 79% da meta". */
  readonly subline: string;
  /** Effective and programmed, as fractions of the goal. */
  readonly effective: number;
  readonly programmed: number;
  readonly effectiveLabel: string;
  readonly programmedLabel: string;
  /** Ring center caption: "da meta" or "da rota". */
  readonly ofLabel: string;
  readonly ringLabel: string;
  /** The curve's goal caption, e.g. "meta 100h". */
  readonly goalCaption: string;
  /** Under the bar, e.g. the journey's stops; else the legend and the note. */
  readonly barFooter?: ReactNode;
  readonly milestones: readonly number[];
}

export function ProgressPanel({
  numbers,
  period,
  goalSeconds,
  log,
  now,
  message,
  dateRange,
}: {
  numbers: ProgressNumbers;
  period: Period;
  goalSeconds: number;
  log: readonly LogEntryView[];
  now: Date;
  message: ReactNode;
  dateRange: readonly [string, string];
}) {
  const [view, setView] = useState<View>(savedView);

  function pick(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Remembering the choice is a convenience; without storage the bar stays the default.
    }
  }

  const percent = Math.round(numbers.effective * 100);
  return (
    <section className="panel" aria-label={strings.challenge.viewsLabel}>
      <div className="split">
        <div className="d big-number">{numbers.headline}</div>
        <div role="radiogroup" aria-label={strings.challenge.viewsLabel} className="segmented">
          {VIEWS.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={strings.challenge.views[v]} onClick={() => pick(v)}>
              {VIEW_ICONS[v]}
            </button>
          ))}
        </div>
      </div>
      <div className="muted small" style={{ whiteSpace: 'nowrap' }}>
        {numbers.subline}
      </div>

      {view === 'bar' && <Bar numbers={numbers} />}
      {view === 'ring' && <Ring numbers={numbers} percent={percent} />}
      {view === 'curve' && <Curve numbers={numbers} period={period} goalSeconds={goalSeconds} log={log} now={now} dateRange={dateRange} />}
      {message}
    </section>
  );
}

const pct = (fraction: number) => `${Math.min(100, Math.max(0, fraction * 100)).toFixed(1)}%`;

function Bar({ numbers }: { numbers: ProgressNumbers }) {
  return (
    <div className="stack">
      <div className="bar" aria-hidden="true">
        <div className="bar-track" />
        <div className="bar-ghost" style={{ width: pct(numbers.programmed) }} />
        <div className="bar-fill" style={{ width: pct(numbers.effective) }} />
        {numbers.milestones.map((m) => (
          <div key={m} className="bar-milestone" style={{ left: pct(m) }} />
        ))}
        <div className="bar-knob" style={{ left: pct(numbers.effective) }} />
        <div className="bar-tick" style={{ left: pct(numbers.programmed) }} />
      </div>
      {numbers.barFooter}
    </div>
  );
}

const OUTER = 2 * Math.PI * 76;
const INNER = 2 * Math.PI * 58;

function Ring({ numbers, percent }: { numbers: ProgressNumbers; percent: number }) {
  const outer = Math.min(1, numbers.programmed) * OUTER;
  const inner = Math.min(1, numbers.effective) * INNER;
  return (
    <div className="ring">
      <div className="ring-figure">
        <svg width="100%" height="100%" viewBox="0 0 170 170" role="img" aria-label={numbers.ringLabel}>
          <circle cx="85" cy="85" r="76" fill="none" stroke="var(--color-ghost-track)" strokeWidth="7" />
          {outer > 0 && (
            <circle cx="85" cy="85" r="76" fill="none" stroke="var(--color-ghost)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${outer.toFixed(1)} ${OUTER.toFixed(1)}`} transform="rotate(-90 85 85)" />
          )}
          <circle cx="85" cy="85" r="58" fill="none" stroke="var(--color-ghost-track)" strokeWidth="16" />
          {inner > 0 && (
            <circle cx="85" cy="85" r="58" fill="none" stroke="var(--color-brand)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${inner.toFixed(1)} ${INNER.toFixed(1)}`} transform="rotate(-90 85 85)" />
          )}
        </svg>
        <div className="ring-center">
          <div className="d text-xl">
            {percent}%
          </div>
          <div className="tiny muted">{numbers.ofLabel}</div>
        </div>
      </div>
      <div className="stack small" style={{ gap: 10 }}>
        <div className="legend-item">
          <span className="swatch brand" />
          {numbers.effectiveLabel}
        </div>
        <div className="legend-item">
          <span className="swatch ghost" />
          {numbers.programmedLabel}
        </div>
      </div>
    </div>
  );
}

const W = 350;
const TOP = 10;
const BOTTOM = 160;

function Curve({
  numbers,
  period,
  goalSeconds,
  log,
  now,
  dateRange,
}: {
  numbers: ProgressNumbers;
  period: Period;
  goalSeconds: number;
  log: readonly LogEntryView[];
  now: Date;
  dateRange: readonly [string, string];
}) {
  const x = (f: number) => (f * W).toFixed(1);
  const y = (f: number) => (BOTTOM - Math.min(1, f) * (BOTTOM - TOP)).toFixed(1);
  const points = curvePoints(period, log, goalSeconds, now);
  const [todayX, todayY] = points[points.length - 1];
  const elapsed = elapsedFraction(period, now);
  // At the current average, where the line would end.
  const projected = elapsed > 0 ? Math.min(1, todayY / elapsed) : todayY;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <svg width="100%" viewBox={`0 0 ${W} 170`} role="img" aria-label={strings.challenge.curveLabel}>
        <line x1="0" y1={TOP} x2={W} y2={TOP} stroke="var(--color-border)" strokeWidth="1" />
        <line x1="0" y1={BOTTOM} x2={W} y2={BOTTOM} stroke="var(--color-border)" strokeWidth="1" />
        <line x1="0" y1={BOTTOM} x2={W} y2={TOP} stroke="var(--color-ghost)" strokeWidth="3" strokeLinecap="round" />
        {elapsed < 1 && <polyline points={`${x(todayX)},${y(todayY)} ${x(1)},${y(projected)}`} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeDasharray="4 5" />}
        <polyline points={points.map(([px, py]) => `${x(px)},${y(py)}`).join(' ')} fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(todayX)} cy={y(todayY)} r="6" fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="2" />
        <text x="2" y="24" fontSize="11" fill="var(--color-text-muted)">
          {numbers.goalCaption}
        </text>
      </svg>
      <div className="axis">
        <span>{dateRange[0]}</span>
        {elapsed > 0 && elapsed < 1 && <span>{strings.challenge.today}</span>}
        <span>{dateRange[1]}</span>
      </div>
    </div>
  );
}

/** The sentence under the progress: ahead, on pace, behind or the final stretch. Never a scolding. */
export function PaceMessage({ title, body, tone }: { title: string; body: string; tone: Pace['tone'] }) {
  return (
    <div className={`message tone-${tone}`} role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
