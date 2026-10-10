/**
 * "Wörter üben" on a Medina lesson (ADR-0025, stage 2): hear and read a word of the lesson and
 * choose its German meaning. A word answered right is stored as practised (skill `words`), earns
 * XP once and from then on joins the learner's review cards (see `useTrainingScope`).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicText } from '@/components';
import { practiceId, randomShuffle, stableShuffle } from '@/services/practice';
import type { MadinahWord } from '@/services/courses';
import { speakArabic } from '@/services/speech';
import { useCelebrationStore, usePracticeStore } from '@/state';

const OPTIONS = 4;

/** The answer and up to three other meanings of the lesson, in a stable order. */
export function meaningOptions(
  word: MadinahWord,
  words: readonly MadinahWord[]
): string[] {
  const others = [
    ...new Set(words.filter((w) => w.id !== word.id).map((w) => w.de)),
  ].filter((de) => de !== word.de);
  const wrong = stableShuffle(others, word.id, (de) => de).slice(0, OPTIONS - 1);
  return stableShuffle([word.de, ...wrong], `${word.id}/options`, (de) => de);
}

export function MadinahWordPractice({
  unit,
  words,
}: {
  unit: number;
  words: readonly MadinahWord[];
}) {
  const { t } = useTranslation('units');
  const records = usePracticeStore((s) => s.records);
  const practise = usePracticeStore((s) => s.practise);
  const celebrate = useCelebrationStore((s) => s.show);
  const ids = useMemo(() => words.map((w) => w.id), [words]);
  const isDone = (id: string) => Boolean(records[practiceId(unit, 'words', id)]);
  const done = ids.filter(isDone).length;

  const [queue, setQueue] = useState<MadinahWord[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [firstTry, setFirstTry] = useState(0);
  const [missed, setMissed] = useState<ReadonlySet<string>>(new Set());

  const start = () => {
    // Words not practised yet come first; a finished lesson repeats all of them.
    const open = words.filter((w) => !isDone(w.id));
    const round = randomShuffle(open.length ? open : words);
    setQueue(round);
    setChosen(null);
    setFirstTry(0);
    setMissed(new Set());
    if (round[0]) speakArabic(round[0].ar);
  };

  const current = queue?.[0];
  const answer = (de: string) => {
    if (!current || chosen) return;
    setChosen(de);
    if (de !== current.de) {
      setMissed((m) => new Set(m).add(current.id));
      return;
    }
    if (!missed.has(current.id)) setFirstTry((n) => n + 1);
    void practise(unit, 'words', current.id, ids).then((outcome) => {
      if (outcome.stationComplete) {
        celebrate({ title: t('words.allPractised'), xp: outcome.xp, big: true });
      } else if (outcome.first) {
        celebrate({ title: t('correct'), xp: outcome.xp, big: false });
      }
    });
  };

  const next = () => {
    if (!queue || !current) return;
    // A wrong answer brings the word back at the end of the round.
    const rest = queue.slice(1);
    const upcoming = chosen === current.de ? rest : [...rest, current];
    setQueue(upcoming);
    setChosen(null);
    if (upcoming[0]) speakArabic(upcoming[0].ar);
  };

  return (
    <section className="card stack" aria-label={t('words.title')}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{t('words.title')}</strong>
        <span className="muted">
          {t('words.practised', { done, total: words.length })}
        </span>
      </div>

      {!queue && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {t('words.intro')}
          </p>
          <button type="button" className="btn btn-primary" onClick={start}>
            {done === 0
              ? t('words.start')
              : done < words.length
                ? t('words.keepGoing')
                : t('words.again')}
          </button>
        </>
      )}

      {queue && current && (
        <div className="stack" style={{ gap: '0.75rem' }}>
          <div className="row" style={{ justifyContent: 'center', gap: '1rem' }}>
            <ArabicText size="hero">{current.ar}</ArabicText>
            <button
              type="button"
              className="btn btn-small"
              aria-label={t('listenTo', { word: current.ar })}
              onClick={() => speakArabic(current.ar)}
            >
              {t('words.listen')}
            </button>
          </div>
          <div
            className="grid"
            role="group"
            aria-label={t('words.choose')}
            style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
          >
            {meaningOptions(current, words).map((de) => {
              const state = !chosen
                ? ''
                : de === current.de
                  ? 'right'
                  : de === chosen
                    ? 'wrong'
                    : '';
              return (
                <button
                  key={de}
                  type="button"
                  className={`btn pattern-option ${state}`}
                  disabled={chosen !== null}
                  lang="de"
                  onClick={() => answer(de)}
                >
                  {de}
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
              <span className={chosen === current.de ? 'feedback-good' : 'feedback-bad'}>
                {chosen === current.de
                  ? t('correctAnswer')
                  : t('words.itMeans', { answer: current.de })}
              </span>
              <button type="button" className="btn btn-primary" onClick={next}>
                {t('next')}
              </button>
            </div>
          )}
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            {t('roundLeft', { count: queue.length })}
          </p>
        </div>
      )}

      {queue && !current && (
        <div className="stack" role="status" style={{ gap: '0.5rem' }}>
          <strong>{t('words.roundDone')}</strong>
          <span className="muted">{t('words.firstTry', { count: firstTry })}</span>
          <button type="button" className="btn" onClick={() => setQueue(null)}>
            {t('finished')}
          </button>
        </div>
      )}
    </section>
  );
}
