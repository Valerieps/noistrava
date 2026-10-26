import { describe, expect, it } from 'vitest';
import { isPlausibleEmail, normalizeEmail } from './email';
import { normalizeName } from './profile';
import { canManageGroup, keepsAnAdmin, normalizeRoles } from './roles';

describe('roles', () => {
  it('lets only admins manage the group', () => {
    expect(canManageGroup({ roles: ['admin'] })).toBe(true);
    expect(canManageGroup({ roles: [] })).toBe(false);
  });

  it('keeps an admin', () => {
    expect(keepsAnAdmin(['a', 'b'], 'a')).toBe(true);
    expect(keepsAnAdmin(['a'], 'a')).toBe(false);
  });

  it('drops unknown roles', () => {
    expect(normalizeRoles(['admin', 'king'])).toEqual(['admin']);
  });
});

describe('e-mail', () => {
  it('compares e-mails in one form', () => {
    expect(normalizeEmail(' Carla@Example.COM ')).toBe('carla@example.com');
    expect(isPlausibleEmail('carla@example.com')).toBe(true);
    expect(isPlausibleEmail('carla@')).toBe(false);
  });
});

describe('normalizeName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeName('  Carla   Souza ')).toBe('Carla Souza');
  });

  it('refuses empty and too long names', () => {
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('x'.repeat(41))).toBeNull();
    expect(normalizeName('x'.repeat(40))).toBe('x'.repeat(40));
  });
});
