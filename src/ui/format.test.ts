import { describe, expect, it } from 'vitest';
import { formatHour, formatWhen } from './format';

const zone = 'America/Sao_Paulo';
// 2026-11-02 12:00 in São Paulo (UTC-3).
const now = new Date('2026-11-02T15:00:00Z');

describe('formatHour', () => {
  it('always shows the minutes', () => {
    expect(formatHour(new Date('2026-11-02T20:00:00Z'), zone)).toBe('17h00');
    expect(formatHour(new Date('2026-11-02T18:08:00Z'), zone)).toBe('15h08');
    expect(formatHour(new Date('2026-11-02T03:00:00Z'), zone)).toBe('0h00');
  });
});

describe('formatWhen', () => {
  it('formats today with minutes', () => {
    expect(formatWhen('2026-11-02T13:05:00Z', zone, now)).toBe('hoje, 10h05');
    expect(formatWhen('2026-11-02T13:00:00Z', zone, now)).toBe('hoje, 10h00');
  });

  it('formats yesterday with minutes', () => {
    expect(formatWhen('2026-11-01T18:08:00Z', zone, now)).toBe('ontem, 15h08');
    expect(formatWhen('2026-11-01T20:00:00Z', zone, now)).toBe('ontem, 17h00');
  });

  it('formats older dates with the same precision', () => {
    expect(formatWhen('2026-10-31T20:00:00Z', zone, now)).toBe('31 de out., 17h00');
    expect(formatWhen('2026-10-31T20:08:00Z', zone, now)).toBe('31 de out., 17h08');
  });
});
