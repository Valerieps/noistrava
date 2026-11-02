import { describe, expect, it } from 'vitest';
import { strings } from './strings';

describe('tracking.asSenhoraValue', () => {
  const format = strings.tracking.asSenhoraValue;

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

describe('templates.daysLabel', () => {
  const label = strings.templates.daysLabel;

  it('names no days, every day, one day and a few', () => {
    expect(label([])).toBe('qualquer dia');
    expect(label([0, 1, 2, 3, 4, 5, 6])).toBe('todo dia');
    expect(label([2])).toBe('qua');
    expect(label([0, 2, 4])).toBe('seg, qua e sex');
  });
});
