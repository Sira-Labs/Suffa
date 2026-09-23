import { describe, expect, it } from 'vitest';
import { isIOS } from '@/services/platform';
import { recognitionHelp, recorderHelp } from './speechHelp';

const iphone = { ios: true, standalone: false };
const iphoneApp = { ios: true, standalone: true };
const desktop = { ios: false, standalone: false };

describe('speech help texts', () => {
  it('gives iPhone users the concrete settings path', () => {
    expect(recorderHelp('denied', iphone)).toMatch(
      /Einstellungen → Apps → Safari → Mikrofon/
    );
    expect(recognitionHelp('service-not-allowed', iphone)).toMatch(/Diktierfunktion/);
    expect(recognitionHelp('language-not-supported', iphone)).toMatch(
      /Arabisch hinzufügen/
    );
  });

  it('suggests Safari instead of the Home Screen app only when running as the app', () => {
    expect(recognitionHelp('timeout', iphoneApp)).toMatch(
      /in Safari statt als Home-Bildschirm-App/
    );
    expect(recognitionHelp('timeout', iphone)).not.toMatch(/Home-Bildschirm-App/);
  });

  it('keeps desktop texts free of iPhone instructions', () => {
    expect(recorderHelp('denied', desktop)).not.toMatch(/iPhone/);
    expect(recognitionHelp('unsupported', desktop)).toMatch(/Chrome oder Edge/);
  });
});

describe('isIOS', () => {
  it('detects iPhone and iPadOS (which reports a Mac with touch)', () => {
    expect(
      isIOS({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        maxTouchPoints: 5,
      })
    ).toBe(true);
    expect(
      isIOS({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 5,
      })
    ).toBe(true);
    expect(
      isIOS({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 0,
      })
    ).toBe(false);
    expect(
      isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 })
    ).toBe(false);
  });
});
