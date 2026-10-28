// The theme each viewer picks in the settings: light, dark or the device's. The device remembers it.

export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
const THEME_KEY = 'senhoras.theme';

/** A stored value as a choice; anything else follows the device. */
export function parseTheme(value: string | null): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'system';
}

export function savedTheme(): ThemeChoice {
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

export function saveTheme(choice: ThemeChoice) {
  applyTheme(choice);
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Remembering the choice is a convenience; without storage the theme follows the device next time.
  }
}

/** Sets `data-theme` on the page (tokens.css reads it) and points the browser's theme-color at the same theme. */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = (meta.dataset.scheme ??= meta.media.includes('dark') ? 'dark' : 'light');
    meta.media = choice === 'system' ? `(prefers-color-scheme: ${own})` : own === choice ? 'all' : 'not all';
  }
}
