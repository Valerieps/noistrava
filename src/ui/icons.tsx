// The line icons of the screen drafts. Decorative: the button or link around them carries the label.
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
