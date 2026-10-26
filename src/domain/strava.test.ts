import { describe, expect, it } from 'vitest';
import { grantedAccess, stravaScope } from './strava';

describe('stravaScope', () => {
  it('asks for private activities only when chosen', () => {
    expect(stravaScope(false)).toBe('activity:read');
    expect(stravaScope(true)).toBe('activity:read_all');
  });
});

describe('grantedAccess', () => {
  it('reads what the member granted', () => {
    expect(grantedAccess('read,activity:read')).toEqual({ includePrivate: false });
    expect(grantedAccess('read,activity:read_all')).toEqual({ includePrivate: true });
  });

  it('refuses a grant without activities', () => {
    expect(grantedAccess('read')).toBeNull();
    expect(grantedAccess('')).toBeNull();
    expect(grantedAccess(null)).toBeNull();
  });
});
