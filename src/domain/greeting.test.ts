import { describe, expect, it } from 'vitest';
import { greetingFor } from './greeting';

describe('greetingFor', () => {
  it.each([
    [0, 'Bom dia'],
    [11, 'Bom dia'],
    [12, 'Boa tarde'],
    [17, 'Boa tarde'],
    [18, 'Boa noite'],
    [23, 'Boa noite'],
  ])('at %i h says %s', (hour, expected) => {
    expect(greetingFor(new Date(2026, 0, 1, hour))).toBe(expected);
  });
});
