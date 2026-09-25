import { describe, expect, it } from 'vitest';
import { SYNC_SCHEMAS } from '../src/sync/schemas.js';

const settings = {
  id: 'user-settings',
  updated_at: '2026-09-24T10:00:00.000Z',
  deleted: false,
  key: 'user-settings',
  tashkilLevel: 'full',
  theme: 'dark',
  arabicFontScale: 1,
  dailyGoal: 20,
  showTransliteration: true,
  dialectNotes: false,
};

describe('settings sync schema: weekly goal (story 5.5)', () => {
  it('defaults to 5 days for app versions that do not send it', () => {
    expect(SYNC_SCHEMAS.settings.parse(settings).weeklyGoal).toBe(5);
  });

  it('accepts 3, 5 or 7 days only', () => {
    expect(SYNC_SCHEMAS.settings.parse({ ...settings, weeklyGoal: 7 }).weeklyGoal).toBe(
      7
    );
    for (const weeklyGoal of [0, 4, 8, '5']) {
      expect(SYNC_SCHEMAS.settings.safeParse({ ...settings, weeklyGoal }).success).toBe(
        false
      );
    }
  });
});
