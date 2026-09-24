import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PracticeSkill, UnitPracticeScope } from '@/types';
import { Icon } from '@/components/Icon';
import { content } from '@/content';
import {
  dialogueSections,
  practiceCount,
  unitPracticeItems,
  type UnitSection,
} from '@/services/practice';
import { useCelebrationStore, useEnrollmentStore, usePracticeStore } from '@/state';
import { isUnlocked } from '@/services/enrollment';
import { LockedPanel } from './UnitGate';
import { BookVideos } from '@/modules/library/BookVideos';
import { PublisherAudio } from '@/modules/library/PublisherAudio';
import { Reading } from '@/modules/reading';
import { Writing } from '@/modules/writing';
import { Speaking } from '@/modules/speaking';
import { Conjugation } from '@/modules/conjugation';
import { isStationKey, STATION_META } from './skills';

const UNITS = 16;

/**
 * One station of a unit, opened inside the unit (redesign v2 "unit room"): the learner never
 * leaves the unit to practise it. Practice stations count first successes per item; finishing
 * a station celebrates it.
 */
export function UnitStation() {
  const { unit: unitParam, station } = useParams();
  const [params] = useSearchParams();
  const unit = Number(unitParam);
  const records = usePracticeStore((s) => s.records);
  const practise = usePracticeStore((s) => s.practise);
  const celebrate = useCelebrationStore((s) => s.show);
  const exams = useEnrollmentStore((s) => s.exams);
  // ?section=k (from the unit path): only dialogue k and its words.
  const sectionNo = Number(params.get('section')) || null;
  const section = useMemo<UnitSection | null>(
    () => dialogueSections(content, unit).find((s) => s.no === sectionNo) ?? null,
    [unit, sectionNo]
  );
  const items = useMemo(
    () => sectionItems(unitPracticeItems(content, unit), section),
    [unit, section]
  );

  const skill = station !== 'listen' ? (station as PracticeSkill) : null;
  const scope = useMemo<UnitPracticeScope | null>(() => {
    if (!skill) return null;
    return {
      unit,
      ...(section && { dialogIds: [section.dialogId], wordIds: section.wordIds }),
      onPractised(itemId) {
        void practise(unit, skill, itemId, items[skill]).then((outcome) => {
          if (outcome.stationComplete) {
            const where = section ? `Dialog ${section.no}` : `Einheit ${unit}`;
            celebrate({
              title: `${STATION_META[skill].label} geschafft · ${where}`,
              xp: outcome.xp,
              big: true,
            });
          }
        });
      },
    };
  }, [skill, unit, section, items, practise, celebrate]);

  if (!Number.isInteger(unit) || unit < 1 || unit > UNITS || !isStationKey(station)) {
    return (
      <div className="stack">
        <h1>Station nicht gefunden</h1>
        <Link to="/units" className="btn">
          Zu allen Einheiten
        </Link>
      </div>
    );
  }

  if (!isUnlocked(unit, exams)) {
    return (
      <div className="stack" style={{ gap: '1.25rem' }}>
        <Link to={`/units/${unit}`} className="back-link">
          <Icon name="arrowLeft" size={18} />
          Einheit {unit}
        </Link>
        <LockedPanel unit={unit} />
      </div>
    );
  }

  const meta = STATION_META[station];
  const total = skill ? items[skill].length : 0;
  const done = skill ? practiceCount(records, unit, skill, items[skill]) : 0;
  const lesson = Number(params.get('lesson')) || undefined;
  // From a section only its dialogue lesson; ?view=videos only the page videos.
  const videosOnly = params.get('view') === 'videos';
  const onlyLesson = section ? lesson : undefined;

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <Link to={`/units/${unit}`} className="back-link">
        <Icon name="arrowLeft" size={18} />
        Einheit {unit}
      </Link>
      <header className="stack" style={{ gap: '0.35rem' }}>
        <span className="eyebrow" style={{ color: 'var(--accent)' }}>
          Einheit {unit}
          {section && ` · Dialog ${section.no}`}
        </span>
        <h1 style={{ margin: 0 }} className="row">
          <Icon name={meta.icon} size={26} />
          {meta.label}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {(section && meta.sectionHint) || meta.hint}
        </p>
        {skill && total > 0 && (
          <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
            <div
              className="review-progress"
              role="progressbar"
              aria-label={`Fortschritt ${meta.label}`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <div style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
              {done} von {total}
            </span>
          </div>
        )}
      </header>

      {station === 'listen' && (
        <>
          {!onlyLesson && (
            <section className="card stack" aria-label="Buchseiten-Videos">
              <BookVideos unit={unit} />
            </section>
          )}
          {!videosOnly && (
            <section className="card stack" aria-label="Offizielle Audios">
              <PublisherAudio
                key={`${unit}-${lesson ?? ''}`}
                unit={unit}
                initialUnit={unit}
                focusLesson={lesson}
                onlyLesson={onlyLesson}
                hideUnitPicker
              />
            </section>
          )}
        </>
      )}
      {station === 'read' && scope && <Reading scope={scope} />}
      {station === 'write' && scope && <Writing scope={scope} />}
      {station === 'speak' && scope && <Speaking scope={scope} />}
      {station === 'verbs' && scope && <Conjugation scope={scope} />}
    </div>
  );
}

/** A section narrows reading and speaking to its dialogue and writing to its words. */
function sectionItems(
  all: Record<PracticeSkill, string[]>,
  section: UnitSection | null
): Record<PracticeSkill, string[]> {
  if (!section) return all;
  return {
    read: [section.dialogId],
    write: section.wordIds,
    speak: section.lineIds,
    verbs: all.verbs,
  };
}
