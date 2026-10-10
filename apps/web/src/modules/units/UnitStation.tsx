import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { PracticeSkill, UnitPracticeScope } from '@/types';
import { Icon } from '@/components/Icon';
import { content } from '@/content';
import {
  dialogueSections,
  practiceCount,
  practiceId,
  unitPracticeItems,
  type UnitSection,
} from '@/services/practice';
import { useCelebrationStore, useEnrollmentStore, usePracticeStore } from '@/state';
import { isUnlocked } from '@/services/enrollment';
import { courseOfUnit } from '@suffa/engagement';
import { madinahLessonPath } from '@/services/courses';
import { LockedPanel } from './UnitGate';
import { BookVideos } from '@/modules/library/BookVideos';
import { PublisherAudio } from '@/modules/library/PublisherAudio';
import { Reading } from '@/modules/reading';
import { Writing } from '@/modules/writing';
import { Speaking } from '@/modules/speaking';
import { Conjugation } from '@/modules/conjugation';
import { Cloze } from '@/modules/cloze';
import { Grammar } from '@/modules/grammar';
import { useClozeIds } from './useClozeIds';
import { useBookProgress } from './useBookProgress';
import { isStationKey, STATION_META } from './skills';
import i18n from '@/i18n';

const UNITS = 16;

/**
 * One station of a unit, opened inside the unit (redesign v2 "unit room"): the learner never
 * leaves the unit to practise it. Practice stations count first successes per item; finishing
 * a station celebrates it.
 */
export function UnitStation() {
  const { t } = useTranslation('units');
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
  // The unit path opens dialogues one after another: a locked dialogue cannot be practised,
  // and the whole-unit view only offers the dialogues that are open. Until the path is known,
  // nothing is offered (it loads with the app's bundled index).
  const { units: book, failed: pathFailed, retry: retryPath } = useBookProgress();
  const pathSections = book.find((u) => u.unit.unit === unit)?.sections;
  const openNos = useMemo(
    () =>
      pathSections
        ?.filter((s) => s.no !== null && s.state !== 'locked')
        .map((s) => s.no as number) ?? null,
    [pathSections]
  );
  const allSections = useMemo(() => dialogueSections(content, unit), [unit]);
  const openSections = useMemo(
    () =>
      openNos && openNos.length < allSections.length
        ? allSections.filter((s) => openNos.includes(s.no))
        : null,
    [openNos, allSections]
  );
  const sectionLocked =
    section !== null && openNos !== null && !openNos.includes(section.no);
  const clozeIds = useClozeIds();
  const items = useMemo(() => {
    const all = unitPracticeItems(content, unit, clozeIds ?? undefined);
    if (section) return sectionItems(all, section);
    if (openSections) return openItems(all, openSections);
    return all;
  }, [unit, section, openSections, clozeIds]);

  const skill = station !== 'listen' ? (station as PracticeSkill) : null;
  const scope = useMemo<UnitPracticeScope | null>(() => {
    if (!skill) return null;
    return {
      unit,
      ...(section && { dialogIds: [section.dialogId], wordIds: section.wordIds }),
      ...(!section &&
        openSections && {
          dialogIds: openSections.map((s) => s.dialogId),
          wordIds: openSections.flatMap((s) => s.wordIds),
        }),
      isPractised: (itemId) =>
        Boolean(usePracticeStore.getState().records[practiceId(unit, skill, itemId)]),
      onPractised(itemId) {
        void practise(unit, skill, itemId, items[skill]).then((outcome) => {
          if (outcome.first && !outcome.stationComplete) {
            celebrate({ title: i18n.t('units:correct'), xp: outcome.xp, big: false });
          }
          if (outcome.stationComplete) {
            const where = section
              ? i18n.t('units:dialogue', { n: section.no })
              : i18n.t('units:unit', { n: unit });
            celebrate({
              title: i18n.t('units:station.complete', {
                station: i18n.t(`units:stations.${skill}.label`),
                where,
              }),
              xp: outcome.xp,
              big: true,
            });
          }
        });
      },
    };
  }, [skill, unit, section, openSections, items, practise, celebrate]);

  // A Medina unit (101+) has no stations; its exercises are on the lesson page.
  if (courseOfUnit(unit)?.id === 'madinah') {
    return <Navigate to={madinahLessonPath(unit)} replace />;
  }

  if (!Number.isInteger(unit) || unit < 1 || unit > UNITS || !isStationKey(station)) {
    return (
      <div className="stack">
        <h1>{t('station.notFound')}</h1>
        <Link to="/units" className="btn">
          {t('toAllUnits')}
        </Link>
      </div>
    );
  }

  if (!isUnlocked(unit, exams)) {
    return (
      <div className="stack" style={{ gap: '1.25rem' }}>
        <Link to={`/units/${unit}`} className="back-link">
          <Icon name="arrowLeft" size={18} />
          {t('unit', { n: unit })}
        </Link>
        <LockedPanel unit={unit} />
      </div>
    );
  }

  if (openNos === null) {
    if (pathFailed) {
      return (
        <section className="card stack" aria-label={t('station.pathFailedLabel')}>
          <strong>{t('station.pathFailed')}</strong>
          <span className="muted">{t('station.pathFailedHint')}</span>
          <button className="btn btn-primary" type="button" onClick={retryPath}>
            {t('station.retry')}
          </button>
        </section>
      );
    }
    return <p className="muted">{t('station.pathLoading')}</p>;
  }

  if (sectionLocked) {
    return (
      <div className="stack" style={{ gap: '1.25rem' }}>
        <Link to={`/units/${unit}`} className="back-link">
          <Icon name="arrowLeft" size={18} />
          {t('unit', { n: unit })}
        </Link>
        <section className="card stack" aria-label={t('station.dialogueLockedLabel')}>
          <strong>{t('station.dialogueLocked', { n: section.no })}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {t('station.dialogueLockedHint', { previous: section.no - 1 })}
          </p>
          <Link to={`/units/${unit}`} className="btn btn-primary">
            {t('toPath')}
          </Link>
        </section>
      </div>
    );
  }

  const meta = STATION_META[station];
  const label = t(`stations.${station}.label`);
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
        {t('unit', { n: unit })}
      </Link>
      <header className="stack" style={{ gap: '0.35rem' }}>
        <span className="eyebrow" style={{ color: 'var(--accent)' }}>
          {t('unit', { n: unit })}
          {section && ` · ${t('dialogue', { n: section.no })}`}
        </span>
        <h1 style={{ margin: 0 }} className="row">
          <Icon name={meta.icon} size={26} />
          {label}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {section ? t(`stations.${station}.sectionHint`) : t(`stations.${station}.hint`)}
        </p>
        {skill && total > 0 && (
          <div className="row" style={{ gap: '0.75rem', flexWrap: 'nowrap' }}>
            <div
              className="review-progress"
              role="progressbar"
              aria-label={t('station.progress', { station: label })}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <div style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
              {t('of', { done, total })}
            </span>
          </div>
        )}
      </header>

      {skill && total > 0 && done >= total && (
        <section className="card row station-done" aria-label={t('station.doneLabel')}>
          <span className="station-done-icon" aria-hidden>
            <Icon name="check" size={22} strokeWidth={2.5} />
          </span>
          <span className="stack" style={{ gap: '0.15rem', flex: 1, minWidth: 0 }}>
            <strong>{t('station.done', { station: label })}</strong>
            <span className="muted">{t('station.doneHint')}</span>
          </span>
          <Link to={`/units/${unit}`} className="btn btn-primary">
            {t('station.continuePath')}
          </Link>
        </section>
      )}

      {station === 'listen' && (
        <>
          {!onlyLesson && (
            <section className="card stack" aria-label={t('station.bookVideos')}>
              <BookVideos unit={unit} />
            </section>
          )}
          {!videosOnly && (
            <section className="card stack" aria-label={t('station.officialAudio')}>
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
      {station === 'grammar' && scope && (
        <Grammar scope={scope} section={section?.no ?? openSections?.map((s) => s.no)} />
      )}
      {station === 'cloze' && scope && <Cloze scope={scope} />}
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
    grammar: section.grammarIds,
    cloze: all.cloze.filter((id) => section.wordIds.includes(id)),
    write: section.writeIds,
    speak: section.lineIds,
    verbs: all.verbs,
  };
}

/** The whole-unit view while later dialogues are locked: the items of the open sections. */
function openItems(
  all: Record<PracticeSkill, string[]>,
  open: UnitSection[]
): Record<PracticeSkill, string[]> {
  const parts = open.map((s) => sectionItems(all, s));
  const join = (skill: PracticeSkill) => [...new Set(parts.flatMap((p) => p[skill]))];
  return {
    read: join('read'),
    grammar: join('grammar'),
    cloze: join('cloze'),
    write: join('write'),
    speak: join('speak'),
    verbs: all.verbs,
  };
}
