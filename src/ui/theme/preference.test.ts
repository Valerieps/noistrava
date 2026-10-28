import { describe, expect, it } from 'vitest';
import { parseTheme } from './preference';

describe('theme preference', () => {
  it('reads a stored choice', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
  });

  it('follows the device when nothing valid is stored', () => {
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('sepia')).toBe('system');
  });
});
