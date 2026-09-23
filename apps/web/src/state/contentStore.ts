/**
 * Store for user-created content (own vocabulary). Unlike the static teaching
 * content, it is synced. After adding, the corresponding SRS cards are
 * created as well (via srsStore.ensureSeedCards).
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
