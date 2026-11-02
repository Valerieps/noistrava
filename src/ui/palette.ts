// The series colors (sports, Senhoras' stretches, history bars), in order. Tokens only, so both
// themes follow tokens.css.
export const TONES = [
  'var(--color-brand)',
  'var(--color-accent)',
  'var(--color-text)',
  'var(--color-brand-ink)',
  'var(--color-ghost-strong)',
  'var(--color-text-muted)',
] as const;

// The sport colors in "Destaques", distinct even with color blindness. "Outros" takes the last one,
// which a sport only gets when there is no "Outros" (sportShares returns five segments at most).
export const CATEGORIES = ['var(--color-cat-1)', 'var(--color-cat-2)', 'var(--color-cat-3)', 'var(--color-cat-4)', 'var(--color-cat-5)'] as const;
export const OTHERS = CATEGORIES[4];
