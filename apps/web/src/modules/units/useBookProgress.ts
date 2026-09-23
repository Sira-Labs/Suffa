import { useEffect, useMemo, useState } from 'react';
import type { AudioUnit, ExamResult, PublisherAudioIndex } from '@/types';
import { content, unitInfos } from '@/content';
import { loadPublisherIndex, trackId } from '@/services/audio/publisherIndex';
import { examRepo } from '@/services/storage';
import {
  unitProgress,
  unitStations,
  type Station,
  type VocabStats,
} from '@/services/units';
import { useContentStore, useListenStore, useSrsStore } from '@/state';

/** Share of a unit test that counts as passed. */
const PASS_RATIO = 0.8;
/** A card is "sure" once its interval reaches three weeks (same rule as mastery). */
const MATURE_DAYS = 21;

export interface UnitOverview {
  unit: AudioUnit;
  title: string | null;
  stations: Station[];
  progress: ReturnType<typeof unitProgress>;
}

/**
 * Everything the unit pages need, from local data only: the publisher index (loaded on
 * demand), listening progress, vocabulary cards, own words and exam results.
 */
export function useBookProgress(): {
  index: PublisherAudioIndex | null;
  units: UnitOverview[];
} {
  const [index, setIndex] = useState<PublisherAudioIndex | null>(null);
  const [exams, setExams] = useState<ExamResult[]>([]);
  const listening = useListenStore((s) => s.progress);
  const cards = useSrsStore((s) => s.cards);
  const userVocab = useContentStore((s) => s.userVocab);

  useEffect(() => {
    let cancelled = false;
    void loadPublisherIndex().then((i) => !cancelled && setIndex(i));
    void examRepo.all().then((e) => !cancelled && setExams(e));
    return () => {
      cancelled = true;
    };
  }, []);

  const units = useMemo(() => {
    if (!index) return [];
    const cardById = new Map(cards.map((c) => [c.id, c]));
    // Unit titles exist only where content files do (e.g. "التحية والتعارف – Begrüßung …").
    const titles = new Map(unitInfos.map((u) => [u.einheit, u.titel]));
    return index.units
      .filter((u) => u.kind === 'unit')
      .map((unit) => {
        const words = [
          ...content.vokabeln.filter((v) => v.einheit === unit.unit).map((v) => v.id),
          ...userVocab.filter((v) => v.einheit === unit.unit).map((v) => v.id),
        ];
        const vocab: VocabStats = { total: words.length, started: 0, mature: 0 };
        for (const id of words) {
          const card = cardById.get(`vocab_ar_de:${id}`);
          if (card && (card.reps > 0 || card.lastReviewed)) vocab.started += 1;
          if (card && card.interval >= MATURE_DAYS) vocab.mature += 1;
        }
        const testPassed = exams.some(
          (e) =>
            e.units.length === 1 &&
            e.units[0] === unit.unit &&
            e.total > 0 &&
            e.score / e.total >= PASS_RATIO
        );
        const stations = unitStations({
          unit,
          isHeard: (url) => Boolean(listening[trackId(index.book, url)]?.completedAt),
          vocab,
          testPassed,
        });
        return {
          unit,
          title: titles.get(unit.unit) ?? null,
          stations,
          progress: unitProgress(stations),
        };
      });
  }, [index, cards, userVocab, listening, exams]);

  return { index, units };
}
