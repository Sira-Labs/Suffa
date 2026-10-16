/**
 * Settings store. Learning data (settings included) lives in IndexedDB; this
 * store holds the reactive mirror for the UI and persists changes via the
 * repo (which in turn fills the outbox → sync).
 */
import { create } from 'zustand';
import type { SettingsRecord, TashkilLevel } from '@/types';
import { settingsRepo, defaultSettings } from '@/services/storage';
import { applyPalette, effectivePalette } from '@/theme/palettes';
import { useClassContextStore } from './classContextStore';

interface SettingsState {
  settings: SettingsRecord;
  loaded: boolean;
  load(): Promise<void>;
  update(
    patch: Partial<Omit<SettingsRecord, 'id' | 'key' | 'updated_at' | 'deleted'>>
  ): Promise<void>;
  setTashkilLevel(level: TashkilLevel): Promise<void>;
  toggleTheme(): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,
  async load() {
    const settings = await settingsRepo.get();
    set({ settings, loaded: true });
    applyDocumentSettings(settings);
  },
  async update(patch) {
    const next = { ...get().settings, ...patch };
    await settingsRepo.save(next);
    set({ settings: next });
    applyDocumentSettings(next);
  },
  async setTashkilLevel(level) {
    await get().update({ tashkilLevel: level });
  },
  async toggleTheme() {
    await get().update({ theme: get().settings.theme === 'dark' ? 'light' : 'dark' });
  },
}));

/** Mirrors theme, colour scheme & font size onto the <html> element (CSS variables). */
export function applyDocumentSettings(settings: SettingsRecord): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = settings.theme;
  applyPalette(
    effectivePalette(settings.palette, useClassContextStore.getState().context?.palette),
    settings.theme
  );
  document.documentElement.style.setProperty(
    '--arabic-font-scale',
    String(settings.arabicFontScale)
  );
}

// The class's colours can change after start (class list, teacher's choice): re-apply.
useClassContextStore.subscribe((state, previous) => {
  if (state.context?.palette !== previous.context?.palette) {
    applyDocumentSettings(useSettingsStore.getState().settings);
  }
});
