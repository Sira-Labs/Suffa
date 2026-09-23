/**
 * Store für nutzererstellte Inhalte (eigene Vokabeln). Diese werden – anders als
 * die statischen Lehrinhalte – synchronisiert. Nach dem Hinzufügen werden auch
 * die zugehörigen SRS-Karten erzeugt (über srsStore.ensureSeedCards).
 */
import { create } from 'zustand';
import type { UserVocab } from '@/types';
import { userVocabRepo } from '@/services/storage';

interface ContentState {
  userVocab: UserVocab[];
  loaded: boolean;
  load(): Promise<void>;
  add(input: Omit<UserVocab, 'id' | 'updated_at' | 'deleted'>): Promise<UserVocab>;
  remove(id: string): Promise<void>;
}

export const useContentStore = create<ContentState>((set, get) => ({
  userVocab: [],
  loaded: false,
  async load() {
    const userVocab = await userVocabRepo.all();
    set({ userVocab, loaded: true });
  },
  async add(input) {
    const record = await userVocabRepo.add(input);
    set({ userVocab: [...get().userVocab, record] });
    return record;
  },
  async remove(id) {
    await userVocabRepo.softDelete(id);
    set({ userVocab: get().userVocab.filter((v) => v.id !== id) });
  },
}));
