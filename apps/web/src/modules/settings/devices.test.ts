import { describe, expect, it } from 'vitest';
import { describeDevice, timeZoneOptions } from './devices';

describe('describeDevice', () => {
  it('names common browsers and systems', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
      )
    ).toBe('Chrome auf Android');
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toBe('Safari auf iPhone');
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'
      )
    ).toBe('Edge auf Windows');
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:130.0) Gecko/20100101 Firefox/130.0'
      )
    ).toBe('Firefox auf Mac');
  });

  it('falls back gracefully', () => {
    expect(describeDevice(null)).toBe('Unbekanntes Gerät');
    expect(describeDevice('curl/8.5.0')).toBe('Browser');
  });
});

describe('timeZoneOptions', () => {
  it('always contains UTC and the requested zones, sorted and unique', () => {
    const zones = timeZoneOptions('Asia/Riyadh', 'Asia/Riyadh', null);
    expect(zones).toContain('UTC');
    expect(zones.filter((z) => z === 'Asia/Riyadh')).toHaveLength(1);
    expect([...zones].sort()).toEqual(zones);
  });
});
