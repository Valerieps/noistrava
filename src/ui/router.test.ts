import { afterEach, describe, expect, it, vi } from 'vitest';
import { goBack } from './router';

function stubHistory(length: number) {
  const history = { length, back: vi.fn(), pushState: vi.fn(), replaceState: vi.fn() };
  vi.stubGlobal('window', { history });
  return history;
}

describe('goBack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns to the previous screen when there is one', () => {
    const history = stubHistory(3);
    goBack('/perfil');
    expect(history.back).toHaveBeenCalledOnce();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('replaces the screen with the fallback when the app was opened right here', () => {
    const history = stubHistory(1);
    goBack('/perfil');
    expect(history.back).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/perfil');
  });
});
