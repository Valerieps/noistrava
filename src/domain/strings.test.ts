import { describe, expect, it } from 'vitest';
import { strings } from './strings';

describe('profile.asSenhoraValue', () => {
  const format = strings.profile.asSenhoraValue;

  it('says "nenhum vencido" when none has been won', () => {
    expect(format(1, 0)).toBe('1 · nenhum vencido');
  });

  it('uses the singular for one', () => {
    expect(format(3, 1)).toBe('3 · 1 vencido');
  });

  it('uses the plural for more than one', () => {
    expect(format(3, 2)).toBe('3 · 2 vencidos');
  });
});
