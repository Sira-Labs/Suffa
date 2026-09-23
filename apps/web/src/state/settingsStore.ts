/**
 * Einstellungs-Store. Lerndaten (auch Settings) leben in IndexedDB; dieser
 * Store hält den reaktiven Spiegel für die UI und persistiert Änderungen über
 * das Repo (das wiederum die Outbox füllt → Sync).
 */
import { create } from 'zustand';
import type { SettingsRecord, TashkilLevel } from '@/types';
import { settingsRepo, defaultSettings } from '@/services/storage';

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

/** Spiegelt Theme & Schriftgröße ins <html>-Element (für CSS-Variablen). */
export function applyDocumentSettings(settings: SettingsRecord): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty(
    '--arabic-font-scale',
    String(settings.arabicFontScale)
  );
}
