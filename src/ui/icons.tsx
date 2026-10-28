// The line icons of the screen drafts. Decorative: the button or link around them carries the label.
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

export function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
