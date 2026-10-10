/**
 * "Lückentext" on a Medina lesson (ADR-0025, stage 2): our own short sentences, each with one
 * missing word that trains the lesson's grammar (مَا or مَنْ, هٰذَا or ذٰلِكَ, the article, the
 * ending after a preposition, the iḍāfa). A sentence completed right is stored once as practice
 * (skill `cloze`, item `gap-<n>`) and earns XP.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyTashkilLevel } from '@/components';
import type { MadinahGap } from '@/services/courses';
import { practiceId, stableShuffle } from '@/services/practice';
import { speakArabic } from '@/services/speech';
import { useCelebrationStore, usePracticeStore, useSettingsStore } from '@/state';

export const GAP = '___';

/** Item id of a gap sentence: its position in the lesson. */
export const gapId = (index: number) => `gap-${index + 1}`;

/** The sentence with the gap shown, or filled in once answered. */
export function GapSentence({ gap, filled }: { gap: MadinahGap; filled?: string }) {
  const { t } = useTranslation('units');
  const level = useSettingsStore((s) => s.settings.tashkilLevel);
  const [before, after] = gap.ar.split(GAP) as [string, string];
  return (
    <p
      lang="ar"
      dir="rtl"
      className="arabic arabic-lg"
      style={{ margin: 0, textAlign: 'center' }}
    >
      {applyTashkilLevel(before, level)}
      <span
        className={filled ? 'gap-filled' : 'gap-blank'}
        aria-label={filled ? undefined : t('gaps.gap')}
      >
        {filled ? applyTashkilLevel(filled, level) : '_____'}
      </span>
      {applyTashkilLevel(after, level)}
    </p>
  );
}

/** A gap's options in a stable order per sentence. */
export function gapOptions(gap: MadinahGap, index: number): string[] {
  return stableShuffle(gap.options, `${gapId(index)}/${gap.answer}`, (o) => o);
}

export function MadinahGaps({
  unit,
  gaps,
}: {
  unit: number;
  gaps: readonly MadinahGap[];
}) {
  const { t } = useTranslation('units');
  const records = usePracticeStore((s) => s.records);
  const practise = usePracticeStore((s) => s.practise);
  const celebrate = useCelebrationStore((s) => s.show);
  const ids = useMemo(() => gaps.map((_, i) => gapId(i)), [gaps]);
  const done = ids.filter((id) => records[practiceId(unit, 'cloze', id)]).length;

  const [index, setIndex] = useState<number | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const gap = index === null ? undefined : gaps[index];

  const answer = (option: string) => {
    if (!gap || index === null || chosen) return;
    setChosen(option);
    if (option !== gap.answer) return;
    speakArabic(gap.ar.replace(GAP, gap.answer));
    void practise(unit, 'cloze', gapId(index), ids).then((outcome) => {
      if (outcome.stationComplete) {
        celebrate({
          title: t('gaps.allFilled'),
          xp: outcome.xp,
          big: true,
        });
      } else if (outcome.first) {
        celebrate({ title: t('correct'), xp: outcome.xp, big: false });
      }
    });
  };

  const next = () => {
    if (index === null) return;
    // A wrong answer tries the same sentence again.
    if (chosen !== gap?.answer) {
      setChosen(null);
      return;
    }
    setIndex(index + 1 < gaps.length ? index + 1 : null);
    setChosen(null);
  };

  return (
    <section className="card stack" aria-label={t('gaps.title')}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{t('gaps.title')}</strong>
        <span className="muted">{t('gaps.solved', { done, total: gaps.length })}</span>
      </div>

      {!gap ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {t('gaps.intro')}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setIndex(0)}>
            {done === 0 ? t('gaps.start') : t('gaps.practise')}
          </button>
        </>
      ) : (
        <div className="stack" style={{ gap: '0.75rem' }}>
          <span className="muted" style={{ textAlign: 'center' }}>
            {t('gaps.sentenceOf', { index: index! + 1, total: gaps.length })}
          </span>
          <GapSentence
            gap={gap}
            filled={chosen === gap.answer ? gap.answer : undefined}
          />
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            {gap.de}
          </p>
          <div
            className="grid"
            role="group"
            aria-label={t('gaps.choose')}
            style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
          >
            {gapOptions(gap, index!).map((option) => {
              const state = !chosen
                ? ''
                : option === gap.answer && chosen === gap.answer
                  ? 'right'
                  : option === chosen
                    ? 'wrong'
                    : '';
              return (
                <button
                  key={option}
                  type="button"
                  lang="ar"
                  dir="rtl"
                  className={`btn pattern-option arabic-inline ${state}`}
                  disabled={chosen !== null}
                  onClick={() => answer(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {chosen && (
            <div
              className="stack"
              role="status"
              style={{ alignItems: 'center', gap: '0.4rem' }}
            >
              <span className={chosen === gap.answer ? 'feedback-good' : 'feedback-bad'}>
                {chosen === gap.answer ? t('correctAnswer') : t('gaps.wrong')}
              </span>
              <button type="button" className="btn btn-primary" onClick={next}>
                {chosen === gap.answer ? t('next') : t('gaps.again')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
