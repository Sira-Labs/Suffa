import { useEffect, useMemo, useState } from 'react';
import type { AudioUnit, PracticeSkill, PublisherAudioIndex } from '@/types';
import { content, unitInfos } from '@/content';
import { loadPublisherIndex, trackId } from '@/services/audio/publisherIndex';
import {
  loadBookVideos,
  videosForUnit,
  type BookVideoData,
} from '@/services/video/bookVideos';
import {
  unitProgress,
  unitStations,
  type Station,
  type VocabStats,
} from '@/services/units';
import {
  useContentStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSrsStore,
} from '@/state';
import {
  enrollmentStatus,
  isUnlocked,
  passedTest,
  type EnrollmentStatus,
} from '@/services/enrollment';
import { PRACTICE_SKILLS, practiceCount, unitPracticeItems } from '@/services/practice';

/** A card is "sure" once its interval reaches three weeks (same rule as mastery). */
const MATURE_DAYS = 21;

/** One ring in the unit header: how far a skill is in this unit. */
export interface SkillProgress {
  key: 'listen' | 'words' | PracticeSkill;
  done: number;
  total: number;
}

export interface UnitOverview {
  unit: AudioUnit;
  title: string | null;
  stations: Station[];
  progress: ReturnType<typeof unitProgress>;
  skills: SkillProgress[];
  /** Opens with the previous unit's test (unit 1 is always open). */
  unlocked: boolean;
  status: EnrollmentStatus;
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
  const exams = useEnrollmentStore((s) => s.exams);
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const [videoData, setVideoData] = useState<BookVideoData | null>(null);
  const listening = useListenStore((s) => s.progress);
  const cards = useSrsStore((s) => s.cards);
  const userVocab = useContentStore((s) => s.userVocab);
  const practiced = usePracticeStore((s) => s.records);

  useEffect(() => {
    let cancelled = false;
    void loadPublisherIndex().then((i) => !cancelled && setIndex(i));
    // Videos are an extra: without their index the path simply has no video station.
    void loadBookVideos()
      .then((v) => !cancelled && setVideoData(v))
      .catch(() => undefined);
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
        const testPassed = passedTest(exams, unit.unit) !== null;
        const items = unitPracticeItems(content, unit.unit);
        const practice = Object.fromEntries(
          PRACTICE_SKILLS.map((skill) => [
            skill,
            {
              done: practiceCount(practiced, unit.unit, skill, items[skill]),
              total: items[skill].length,
            },
          ])
        ) as Record<PracticeSkill, { done: number; total: number }>;
        const isHeard = (url: string) =>
          Boolean(listening[trackId(index.book, url)]?.completedAt);
        const tracks = unit.lessons.flatMap((l) => l.tracks);
        const allSkills: SkillProgress[] = [
          {
            key: 'listen',
            done: tracks.filter((t) => isHeard(t.url)).length,
            total: tracks.length,
          },
          { key: 'words', done: vocab.started, total: vocab.total },
          ...PRACTICE_SKILLS.map((skill) => ({ key: skill, ...practice[skill] })),
        ];
        const skills = allSkills.filter((sk) => sk.total > 0);
        const stations = unitStations({
          unit,
          isHeard,
          vocab,
          testPassed,
          videos: videoStation(videoData, unit.unit),
          practice,
        });
        return {
          unit,
          title: titles.get(unit.unit) ?? null,
          stations,
          progress: unitProgress(stations),
          skills,
          unlocked: isUnlocked(unit.unit, exams),
          status: enrollmentStatus(enrollments[unit.unit], exams, unit.unit),
        };
      });
  }, [index, cards, userVocab, listening, exams, enrollments, videoData, practiced]);

  return { index, units };
}

function videoStation(
  data: BookVideoData | null,
  unit: number
): { count: number; from: number; to: number } | null {
  const unitVideos = data ? videosForUnit(data, unit) : null;
  if (!unitVideos) return null;
  return { count: unitVideos.videos.length, from: unitVideos.from, to: unitVideos.to };
}
