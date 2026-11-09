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

describe('seasons', () => {
  const s = strings.seasons;

  it('joins names with "e"', () => {
    expect(s.and([])).toBe('');
    expect(s.and(['Ana'])).toBe('Ana');
    expect(s.and(['Ana', 'Bia', 'Cris'])).toBe('Ana, Bia e Cris');
  });

  it('says who was first but already had 2 titles', () => {
    expect(s.blockedNote('Bia', false, 'Sprint final', 'Carol')).toBe('Bia foi 1ª em Sprint final, mas já tinha 2 títulos. O título foi para Carol.');
    expect(s.blockedNote('Ana e Bia', true, 'Multitalento', '')).toBe('Ana e Bia foram 1ª em Multitalento, mas já tinham 2 títulos.');
  });

  it('counts the days left of the stage', () => {
    expect(s.runningMeta(38, '17 dez')).toBe('Parcial · faltam 38 dias · fecha em 17 dez');
    expect(s.runningMeta(1, '17 dez')).toBe('Parcial · falta 1 dia · fecha em 17 dez');
    expect(s.runningMeta(0, '17 dez')).toBe('Parcial · último dia · fecha em 17 dez');
  });
});
