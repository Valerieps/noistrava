// The line icons of the screen drafts. Decorative: the button or link around them carries the label.
import { useId, type ReactNode } from 'react';
import type { RankingKey } from '../domain/seasons/rankings';
import type { Season } from '../domain/seasons/stages';
import type { BadgeKey } from '../domain/tracking/tracking';

const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true } as const;

export function FlagIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...common}>
      <path d="M5 21V4h12l-2 4 2 4H5" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...common} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...common} strokeWidth={2.4}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...common} strokeWidth={2.4}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

export function SwapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...common} strokeWidth={2.2}>
      <path d="M8 20V5M4 9l4-4 4 4M16 4v15M12 15l4 4 4-4" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...common}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...common} strokeWidth={2.4}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...common} strokeWidth={2.4}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function HeartIcon({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7-4.4-9.3-8.8A5.2 5.2 0 0 1 12 6.3a5.2 5.2 0 0 1 9.3 4.9C19 15.6 12 20 12 20z" />
    </svg>
  );
}

export function BarViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...common} strokeWidth={2.2}>
      <rect x="2" y="9" width="20" height="6" rx="3" />
      <path d="M2 12h12" />
    </svg>
  );
}

export function RingViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...common} strokeWidth={2.2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

export function CurveViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...common} strokeWidth={2.2}>
      <path d="M3 20L9 13l4 3 8-11" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...common}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 21h4" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

const BADGE_PATHS: Record<BadgeKey, string> = {
  early_bird: 'M12 3v3M5.6 6.6l2.1 2.1M18.4 6.6l-2.1 2.1M3 16h18M7 16a5 5 0 0 1 10 0M5 20h14',
  night_owl: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  consistent: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4',
  comeback: 'M4 17l6-6 4 4 6-7M14 8h6v6',
  eclectic: 'M12 3l3.5 6h-7zM4 14h6v6H4zM17 20a3 3 0 1 0 0-6a3 3 0 0 0 0 6z',
  hours_10: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z',
  hours_50: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z',
  hours_100: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z',
  golden_link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  loyal_fan: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
};

export function BadgeIcon({ badge, size = 18 }: { badge: BadgeKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round">
      <path d={BADGE_PATHS[badge]} />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...common} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

/** The pace message's round icon: ahead, on pace, behind or the final stretch. */
export function PaceIcon({ tone }: { tone: 'ahead' | 'onPace' | 'behind' | 'finalStretch' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...common} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      {tone === 'ahead' && <path d="M12 19V5M5 12l7-7 7 7" />}
      {tone === 'onPace' && <path d="M5 12.5l4.5 4.5L19 7" />}
      {tone === 'behind' && <path d="M13 3L5 14h6l-1 7 8-11h-6z" />}
      {tone === 'finalStretch' && <path d="M5 21V4h12l-2 4 2 4H5" />}
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
    </svg>
  );
}

type SportFamily = 'run' | 'walk' | 'ride' | 'swim' | 'strength' | 'mind' | 'water' | 'ball' | 'climb' | 'other';

const SPORT_FAMILIES: Record<Exclude<SportFamily, 'other'>, readonly string[]> = {
  run: ['Run', 'TrailRun', 'VirtualRun'],
  walk: ['Walk', 'Hike', 'Snowshoe'],
  ride: ['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'VirtualRide', 'Velomobile', 'Handcycle'],
  swim: ['Swim'],
  strength: ['WeightTraining', 'Workout', 'HighIntensityIntervalTraining', 'Crossfit', 'Elliptical', 'StairStepper'],
  mind: ['Yoga', 'Pilates'],
  water: ['Rowing', 'VirtualRow', 'Kayaking', 'Canoeing', 'Surfing', 'Kitesurf', 'Windsurf', 'StandUpPaddling', 'Sail'],
  ball: ['Soccer', 'Tennis', 'Badminton', 'Pickleball', 'Racquetball', 'Squash', 'TableTennis', 'Golf'],
  climb: ['RockClimbing'],
};

function sportFamily(sport: string): SportFamily {
  for (const [family, sports] of Object.entries(SPORT_FAMILIES)) if (sports.includes(sport)) return family as SportFamily;
  return 'other';
}

const SPORT_PATHS: Record<SportFamily, string> = {
  run: 'M14 3.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zM7 21l3.5-6 3 2.5V21M10.5 15l2-6.5 3.5 3h3M12.5 8.5l-4 1-2 3',
  walk: 'M12.5 3.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zM9 21l2.5-6.5 2.5 2.5v4M11.5 14.5l1-6 2.5 3h2.5M12.5 8.5l-3 2.5v3',
  ride: 'M6 14a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zM18 14a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zM6 17.5l3.5-7h6.5l2 7M9.5 10.5l3 7H6M14 6.5h2.5',
  swim: 'M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M16 6a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zM6 13.5l4.5-4.5 3.5 3.5',
  strength: 'M6.5 7v10M3.5 10v4M17.5 7v10M20.5 10v4M6.5 12h11',
  mind: 'M12 3.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zM12 9v6M6 11.5l6-2.5 6 2.5M5 19l7-4 7 4',
  water: 'M3 18c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M7 15L17 4M15 4.5l3 3',
  ball: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8',
  climb: 'M3 20l6-11 4 6 3-4 5 9z',
  other: 'M3 12h4l2-5 4 10 2-5h6',
};

/** An activity's sport, by family: running, cycling, swimming, strength and so on. */
export function SportIcon({ sport, size = 16 }: { sport: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round">
      <path d={SPORT_PATHS[sportFamily(sport)]} />
    </svg>
  );
}

/** "Vários": a day with two or more different sports. */
export function SeveralSportsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <circle cx="8" cy="16" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

// Corrida das Estações (docs/spec/corrida-das-estacoes.md, "Onde eu vejo"): each season's icon, each
// ranking's symbol, the medal and the diamond of the year. Colors come from tokens.css.

const seasonColor = (season: Season) => `var(--season-${season})`;

function SeasonShape({ season, color, middle }: { season: Season; color: string; middle: string }) {
  const at = (angle: number, distance: number) => `${(12 + Math.cos(angle) * distance).toFixed(2)},${(12 + Math.sin(angle) * distance).toFixed(2)}`;
  if (season === 'summer')
    return (
      <>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <polygon key={i} points={`${at(a - 0.17, 7.4)} ${at(a, 11.6)} ${at(a + 0.17, 7.4)}`} fill={color} />;
        })}
        <circle cx="12" cy="12" r="6" fill={color} />
      </>
    );
  if (season === 'autumn')
    return (
      <>
        <path
          fill={color}
          d="M12 1.5l1.7 4 2.5-1.1-.7 4.6 4-2-1 3.2 3.5.9-3.7 3.2.9 2.2-5.4-.9-1 2.4.3 3.4h-1.9l.3-3.4-1-2.4-5.4.9.9-2.2-3.7-3.2 3.5-.9-1-3.2 4 2-.7-4.6 2.5 1.1z"
        />
        <path d="M12 15v7" stroke={color} strokeWidth="1.4" />
      </>
    );
  if (season === 'winter')
    return (
      <>
        <g stroke={color} strokeWidth="2" strokeLinecap="round" fill="none">
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 60} 12 12)`}>
              <path d="M12 12V1.8M12 5.2l-2.8-2.4M12 5.2l2.8-2.4M12 8.6l-2.2-1.8M12 8.6l2.2-1.8" />
            </g>
          ))}
        </g>
        <circle cx="12" cy="12" r="1.8" fill={color} />
      </>
    );
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx="12" cy="5.6" rx="2.5" ry="4.8" fill={color} transform={`rotate(${i * 45} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="2.6" fill={middle} />
    </>
  );
}

/** Sun, maple leaf, snowflake or flower; in the season's color, or `currentColor` when `plain`. */
export function SeasonIcon({ season, size = 24, plain = false }: { season: Season; size?: number; plain?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <SeasonShape season={season} color={plain ? 'currentColor' : seasonColor(season)} middle="var(--color-surface)" />
    </svg>
  );
}

const RANKING_PATHS: Record<RankingKey, ReactNode> = {
  activities: <path d="M5 5v14M9 5v14M13 5v14M17 5v14M3 16L20 8" />,
  hours: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2.5" />
    </>
  ),
  momentum: <path d="M12 3c3.5 4 6 6.5 6 10.5a6 6 0 0 1-12 0c0-2.8 1.6-4.4 3-6.2.8 2 1.8 3 3 3.2-.5-2.6-.8-4.8 0-7.5z" />,
  weekend: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M12.5 13h2.5v3h-2.5zM16 13h2.5v3H16z" fill="currentColor" />
    </>
  ),
  variety: (
    <>
      <circle cx="7" cy="7" r="3" />
      <path d="M17 4l3.2 5.5h-6.4z" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M17 14v6M14 17h6" />
    </>
  ),
  marathon: (
    <>
      <path d="M5 21c0-5 14-4 14-9s-9-3-9-7" />
      <circle cx="10" cy="4" r="1.6" fill="currentColor" />
    </>
  ),
  comeback: (
    <>
      <path d="M3 6l6 9 4-4 7 7" />
      <path d="M15 18h5v-5" />
    </>
  ),
  sprint: (
    <>
      <path d="M5 21V3.5M5 4h13v9H5" />
      <path d="M5 4h4.3v3H5zM13.6 4H18v3h-4.4zM9.3 7h4.3v3H9.3zM5 10h4.3v3H5zM13.6 10H18v3h-4.4z" fill="currentColor" stroke="none" />
    </>
  ),
  steady: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M9.5 6.8 10 2.5h4l.5 4.3M9.5 17.2l.5 4.3h4l.5-4.3M12 9.5V12l1.6 1" />
    </>
  ),
};

/** The symbol of a ranking, in `currentColor`. */
export function RankingIcon({ ranking, size = 16 }: { ranking: RankingKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {RANKING_PATHS[ranking]}
    </svg>
  );
}

/** The metal gradients a medal or the diamond fills with, under ids unique to this drawing. */
function MetalDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--color-metal-hi)" />
        <stop offset=".55" stopColor="var(--color-metal-mid)" />
        <stop offset="1" stopColor="var(--color-metal-lo)" />
      </linearGradient>
      <linearGradient id={`${id}-in`} x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--color-metal-mid)" />
        <stop offset="1" stopColor="var(--color-metal-in)" />
      </linearGradient>
    </defs>
  );
}

/**
 * A title's medal: hollow metal, the ranking's symbol in the center in the season's color, and the
 * season's icon on the badge at the bottom of the ring. Without a ranking, the season's own medal.
 * `ghost`: nobody holds it yet, all in metal.
 */
export function Medal({ season, ranking, label, width = 64, ghost = false }: { season: Season; ranking?: RankingKey; label: string; width?: number; ghost?: boolean }) {
  const id = useId().replace(/:/g, '');
  const color = ghost ? 'var(--color-metal-lo)' : seasonColor(season);
  return (
    <svg width={width} height={(width * 150) / 120} viewBox="0 0 120 150" aria-hidden="true">
      <MetalDefs id={id} />
      <path d="M30 0h22l14 50H44z" fill={ghost ? 'var(--color-metal-mid)' : color} />
      <path d="M68 0h22L76 50H54z" fill={ghost ? 'var(--color-metal-in)' : color} opacity=".82" />
      <path d="M38 0h6l14 50h-6zM76 0h6L68 50h-6z" fill="#ffffff" opacity=".55" />
      <rect x="49" y="42" width="22" height="9" rx="3" fill={`url(#${id}-metal)`} stroke="var(--color-metal-lo)" />
      <circle cx="60" cy="92" r="43" fill={`url(#${id}-metal)`} stroke="var(--color-metal-lo)" strokeWidth="1.2" />
      <circle cx="60" cy="92" r="29" fill={`url(#${id}-in)`} stroke="var(--color-metal-lo)" strokeWidth="1.5" />
      <path id={`${id}-ring`} d="M60 128a36 36 0 1 1 .1 0" fill="none" />
      <text fontSize="6.4" fontWeight="700" letterSpacing="1.6" fill="var(--color-metal-ink)" style={{ fontFamily: 'var(--font-sans)' }}>
        <textPath href={`#${id}-ring`} startOffset="6%">
          {label.toUpperCase()}
        </textPath>
      </text>
      {ranking ? (
        <>
          <g transform="translate(38.4 70.4) scale(1.8)" color={color} fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            {RANKING_PATHS[ranking]}
          </g>
          <circle cx="60" cy="133" r="11.5" fill={color} stroke="var(--color-metal-hi)" strokeWidth="2" />
          <g transform="translate(52.2 125.2) scale(.65)">
            <SeasonShape season={season} color="#ffffff" middle={color} />
          </g>
        </>
      ) : (
        <g transform="translate(39 71) scale(1.75)">
          <SeasonShape season={season} color={color} middle={`url(#${id}-in)`} />
        </g>
      )}
    </svg>
  );
}

const DIAMOND_CORNERS: Record<Season, [number, number]> = { summer: [120, 68], autumn: [180, 128], winter: [120, 188], spring: [60, 128] };

/**
 * The year as a diamond with the four seasons. With `counts`, a corner lights up with its number of
 * titles, and stays dim without any; without, every corner is lit.
 */
export function Diamond({ label, counts, width = 96 }: { label: string; counts?: Partial<Record<Season, number>>; width?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={width} height={(width * 280) / 240} viewBox="0 0 240 280" aria-hidden="true">
      <MetalDefs id={id} />
      <path d="M120 4 L236 128 L120 252 L4 128 Z" fill="var(--color-ink-block)" stroke="var(--color-metal-lo)" />
      <path d="M100 252h40l22 26H78z" fill="var(--color-ink-block)" />
      <text x="120" y="270" textAnchor="middle" fontSize="15" fontStyle="italic" fontWeight="700" fill="var(--color-on-ink-block)" style={{ fontFamily: 'var(--font-display)' }}>
        {label}
      </text>
      {(Object.keys(DIAMOND_CORNERS) as Season[]).map((season) => {
        const [x, y] = DIAMOND_CORNERS[season];
        const count = counts?.[season] ?? 0;
        const lit = !counts || count > 0;
        return (
          <g key={season}>
            <g opacity={lit ? 1 : 0.35}>
              <circle cx={x} cy={y} r="40" fill={`url(#${id}-metal)`} stroke="var(--color-metal-lo)" />
              <circle cx={x} cy={y} r="27" fill={`url(#${id}-in)`} />
              <g transform={`translate(${x - 21} ${y - 21}) scale(1.75)`}>
                <SeasonShape season={season} color={lit ? seasonColor(season) : 'var(--color-metal-lo)'} middle={`url(#${id}-in)`} />
              </g>
            </g>
            {counts && count > 0 && (
              <>
                <circle cx={x + 28} cy={y - 28} r="13" fill="var(--color-brand)" stroke="var(--color-ink-block)" strokeWidth="2" />
                <text x={x + 28} y={y - 23.5} textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--color-on-brand)" style={{ fontFamily: 'var(--font-sans)' }}>
                  {count}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
