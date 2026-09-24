import { describe, expect, it, vi } from 'vitest';
import { legacyHashTarget, migrateLegacyHashUrl } from './legacyHashUrl';

describe('legacy hash URLs', () => {
  it('turns #/path into /path, with query strings', () => {
    expect(legacyHashTarget('#/units/1')).toBe('/units/1');
    expect(legacyHashTarget('#/units/1/write?section=2')).toBe(
      '/units/1/write?section=2'
    );
    expect(legacyHashTarget('#/')).toBe('/');
  });

  it('leaves other hashes alone (sign-in tokens, anchors)', () => {
    expect(legacyHashTarget('#access_token=abc&type=magiclink')).toBeNull();
    expect(legacyHashTarget('#audio')).toBeNull();
    expect(legacyHashTarget('')).toBeNull();
  });

  it('replaces the URL without a new history entry', () => {
    const history = { replaceState: vi.fn() };
    migrateLegacyHashUrl({ hash: '#/discover' }, history);
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/discover');
    history.replaceState.mockClear();
    migrateLegacyHashUrl({ hash: '' }, history);
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
