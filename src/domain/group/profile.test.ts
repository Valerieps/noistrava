import { describe, expect, it } from 'vitest';
import { capitalizeName, firstName, normalizeName } from './profile';

describe('capitalizeName', () => {
  it('capitalizes each word', () => {
    expect(capitalizeName('valeria souza')).toBe('Valeria Souza');
  });
  it('keeps particles in lowercase after the first word', () => {
    expect(capitalizeName('maria da silva')).toBe('Maria da Silva');
    expect(capitalizeName('de souza')).toBe('De Souza');
  });
  it('capitalizes after a hyphen and accented letters', () => {
    expect(capitalizeName('ana-clara álvares')).toBe('Ana-Clara Álvares');
  });
  it('leaves other letters as typed', () => {
    expect(capitalizeName('Valéria McDonald')).toBe('Valéria McDonald');
  });
});

describe('normalizeName', () => {
  it('trims, collapses spaces and capitalizes', () => {
    expect(normalizeName('  valeria   souza ')).toBe('Valeria Souza');
  });
  it('rejects empty names', () => {
    expect(normalizeName('   ')).toBeNull();
  });
});

describe('firstName', () => {
  it('returns the first word', () => {
    expect(firstName('Valeria Souza')).toBe('Valeria');
    expect(firstName('Valeria')).toBe('Valeria');
  });
});
