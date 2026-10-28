// The progress in the challenge's top: effective against programmed, as a bar, a ring or a curve
// (each viewer picks one and the device remembers it), and the pace sentence on the sheet.
import { useState, type ReactNode } from 'react';
import type { LogEntryView } from '../../../application/api-contract';
import { curvePoints, elapsedFraction, type Pace, type Period } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { BarViewIcon, CurveViewIcon, PaceIcon, RingViewIcon } from '../../icons';

export type View = 'bar' | 'ring' | 'curve';
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
  /** Effective and programmed, as fractions of the goal. */
  readonly effective: number;
  readonly programmed: number;
  /** "da meta" or "da rota". */
  readonly ofLabel: string;
  readonly ringLabel: string;
  /** The curve's goal caption, e.g. "meta 100h". */
  readonly goalCaption: string;
}

export function ViewPicker({ view, onPick }: { view: View; onPick: (next: View) => void }) {
  return (
    <div role="radiogroup" aria-label={strings.challenge.viewsLabel} className="segmented">
      {VIEWS.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={strings.challenge.views[v]} onClick={() => onPick(v)}>
          {VIEW_ICONS[v]}
        </button>
      ))}
    </div>
  );
}

/** The chosen view, remembered on the device. */
export function useProgressView(): [View, (next: View) => void] {
  const [view, setView] = useState<View>(savedView);
  function pick(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Remembering the choice is a convenience; without storage the bar stays the default.
    }
  }
  return [view, pick];
}

const pct = (fraction: number) => `${Math.min(100, Math.max(0, fraction * 100)).toFixed(1)}%`;

const HERO_RADIUS = 60;
const HERO_LENGTH = 2 * Math.PI * HERO_RADIUS;

/** The ring in the challenge's top: the track, the programmed and the effective, in white. */
export function HeroRing({ numbers }: { numbers: ProgressNumbers }) {
  const arc = (fraction: number) => `${(Math.min(1, Math.max(0, fraction)) * HERO_LENGTH).toFixed(1)} ${HERO_LENGTH.toFixed(1)}`;
  const circle = (stroke: string, dash?: string) => (
    <circle cx="66" cy="66" r={HERO_RADIUS} fill="none" stroke={stroke} strokeWidth="12" strokeLinecap={dash ? 'round' : undefined} strokeDasharray={dash} transform="rotate(-90 66 66)" />
  );
  return (
    <div className="hero-ring">
      <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={numbers.ringLabel}>
        {circle('rgba(255, 255, 255, 0.22)')}
        {numbers.programmed > 0 && circle('rgba(255, 255, 255, 0.45)', arc(numbers.programmed))}
        {numbers.effective > 0 && circle('#ffffff', arc(numbers.effective))}
      </svg>
      <div className="hero-ring-center d" aria-hidden="true">
        {Math.round(numbers.effective * 100)}%
      </div>
    </div>
  );
}

/** The pace sentence on the sheet: a round icon, the title and the text, with no box. */
export function PaceNote({ title, body, tone }: { title: string; body: string; tone: Pace['tone'] }) {
  return (
    <div className="sheet-note" role="status">
      <div className="sheet-note-icon">
        <PaceIcon tone={tone} />
      </div>
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </div>
  );
}

const HERO_W = 350;
const HERO_TOP = 10;
const HERO_BOTTOM = 160;

/** The big number and the figure under it (ring, bar or curve), drawn in white on the hero color. */
export function HeroProgress({
  view,
  numbers,
  of,
  programmedNote,
  barNote,
  unit = false,
  period,
  goalSeconds,
  log,
  now,
  dateRange,
}: {
  view: View;
  numbers: ProgressNumbers;
  /** "de 60h · programado hoje 42h35" */
  of: string;
  /** "programado hoje 42h35", under the bar; absent when the challenge is over. */
  programmedNote?: string;
  /** On the left under the bar; "64% da meta" when absent. */
  barNote?: string;
  /** The number is a distance: bigger, with "de 240 km" beside it instead of under it. */
  unit?: boolean;
  period: Period;
  goalSeconds: number;
  log: readonly LogEntryView[];
  now: Date;
  dateRange: readonly [string, string];
}) {
  const total = (
    <div className={unit ? 'hero-c-km' : undefined}>
      <div className={`d hero-c-number${unit ? ' big' : ''}`}>{numbers.headline}</div>
      <div className="hero-c-of">{of}</div>
    </div>
  );
  if (view === 'ring') {
    return (
      <div className="hero-c-total">
        <HeroRing numbers={numbers} />
        {total}
      </div>
    );
  }
  return (
    <div className="hero-c-figure">
      {total}
      {view === 'bar' ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="hero-bar" aria-hidden="true">
            <div className="hero-bar-programmed" style={{ width: pct(numbers.programmed) }} />
            <div className="hero-bar-effective" style={{ width: pct(numbers.effective) }} />
          </div>
          <div className="hero-bar-notes">
            <span>{barNote ?? `${Math.round(numbers.effective * 100)}% ${numbers.ofLabel}`}</span>
            {programmedNote && <span>{programmedNote}</span>}
          </div>
        </div>
      ) : (
        <HeroCurve goalCaption={numbers.goalCaption} period={period} goalSeconds={goalSeconds} log={log} now={now} dateRange={dateRange} />
      )}
    </div>
  );
}

function HeroCurve({ goalCaption, period, goalSeconds, log, now, dateRange }: { goalCaption: string; period: Period; goalSeconds: number; log: readonly LogEntryView[]; now: Date; dateRange: readonly [string, string] }) {
  const x = (f: number) => (f * HERO_W).toFixed(1);
  const y = (f: number) => (HERO_BOTTOM - Math.min(1, f) * (HERO_BOTTOM - HERO_TOP)).toFixed(1);
  const points = curvePoints(period, log, goalSeconds, now);
  const [todayX, todayY] = points[points.length - 1];
  const elapsed = elapsedFraction(period, now);
  const muted = 'var(--color-on-hero-muted)';
  return (
    <div className="stack" style={{ gap: 6 }}>
      <svg width="100%" viewBox={`0 0 ${HERO_W} 170`} role="img" aria-label={strings.challenge.curveLabel}>
        <line x1="0" y1={HERO_TOP} x2={HERO_W} y2={HERO_TOP} stroke={muted} strokeOpacity="0.4" strokeWidth="1" />
        <line x1="0" y1={HERO_BOTTOM} x2={HERO_W} y2={HERO_BOTTOM} stroke={muted} strokeOpacity="0.4" strokeWidth="1" />
        <line x1="0" y1={HERO_BOTTOM} x2={HERO_W} y2={HERO_TOP} stroke="rgba(255, 255, 255, 0.45)" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />
        <polyline points={points.map(([px, py]) => `${x(px)},${y(py)}`).join(' ')} fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(todayX)} cy={y(todayY)} r="5" fill="#ffffff" />
        <text x="2" y="24" fontSize="11" fill={muted}>
          {goalCaption}
        </text>
      </svg>
      <div className="hero-bar-notes">
        <span>{dateRange[0]}</span>
        {elapsed > 0 && elapsed < 1 && <span>{strings.challenge.today}</span>}
        <span>{dateRange[1]}</span>
      </div>
    </div>
  );
}
