/**
 * "Diktat" on a Medina lesson (ADR-0025, stage 2): hear a word of the lesson and write it in
 * Arabic. Vowel signs are optional, as in the unit writing station. A word written right is
 * stored once as practice (skill `write`, unit = the lesson unit) and earns XP.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicText, Feedback, RecallInput } from '@/components';
import { practiceId, randomShuffle } from '@/services/practice';
import type { MadinahWord } from '@/services/courses';
import { isTtsSupported, speakArabic } from '@/services/speech';
import { diffArabic, gradeAnswer, type AnswerVerdict } from '@/services/srs';
import { useCelebrationStore, usePracticeStore } from '@/state';

export function MadinahDictation({
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
  const isDone = (id: string) => Boolean(records[practiceId(unit, 'write', id)]);
  const done = ids.filter(isDone).length;

  const [queue, setQueue] = useState<MadinahWord[] | null>(null);
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const [shown, setShown] = useState(false);
  const current = queue?.[0];
  const solved = verdict !== null && verdict !== 'wrong';

  const present = (round: MadinahWord[]) => {
    setQueue(round);
    setValue('');
    setVerdict(null);
    setShown(false);
    if (round[0]) speakArabic(round[0].ar);
  };

  const start = () => {
    // Words not written yet come first; a finished lesson repeats all of them.
    const open = words.filter((w) => !isDone(w.id));
    present(randomShuffle(open.length ? open : words));
  };

  const check = () => {
    if (!current || solved) return;
    const graded = gradeAnswer(value, current.ar);
    setVerdict(graded);
    if (graded === 'wrong') return;
    void practise(unit, 'write', current.id, ids).then((outcome) => {
      if (outcome.stationComplete) {
        celebrate({
          title: t('dictation.allWritten'),
          xp: outcome.xp,
          big: true,
        });
      } else if (outcome.first) {
        celebrate({ title: t('dictation.writtenRight'), xp: outcome.xp, big: false });
      }
    });
  };

  const next = () => {
    if (!queue || !current) return;
    // A word not written right comes back at the end of the round.
    const rest = queue.slice(1);
    present(solved ? rest : [...rest, current]);
  };

  return (
    <section className="card stack" aria-label={t('dictation.title')}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{t('dictation.title')}</strong>
        <span className="muted">
          {t('dictation.written', { done, total: words.length })}
        </span>
      </div>

      {!queue && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {t('dictation.intro')}
          </p>
          <button type="button" className="btn btn-primary" onClick={start}>
            {done === 0
              ? t('dictation.start')
              : done < words.length
                ? t('dictation.keepGoing')
                : t('dictation.again')}
          </button>
        </>
      )}

      {queue && current && (
        <div className="stack" style={{ gap: '0.75rem', alignItems: 'center' }}>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={() => speakArabic(current.ar)}>
              {t('dictation.listenAgain')}
            </button>
            {!solved && (
              <button type="button" className="btn" onClick={() => setShown(true)}>
                {t('dictation.showWord')}
              </button>
            )}
          </div>
          {(shown || !isTtsSupported()) && !solved && (
            <span className="muted">
              {isTtsSupported() ? t('dictation.theWord') : t('dictation.noSpeech')}{' '}
              <ArabicText>{current.ar}</ArabicText>
            </span>
          )}
          <div style={{ width: '100%' }}>
            <RecallInput
              value={value}
              onChange={setValue}
              onSubmit={solved ? next : check}
              placeholder={t('dictation.placeholder')}
              disabled={solved}
            />
          </div>
          <div className="row">
            {solved ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                {t('next')}
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={check}>
                  {t('dictation.check')}
                </button>
                <button type="button" className="btn" onClick={next}>
                  {t('later')}
                </button>
              </>
            )}
          </div>
          {verdict && (
            <Feedback
              verdict={verdict}
              expected={current.ar}
              diff={diffArabic(value, current.ar)}
              explanation={current.de}
            />
          )}
          <p className="muted" style={{ margin: 0 }}>
            {t('roundLeft', { count: queue.length })}
          </p>
        </div>
      )}

      {queue && !current && (
        <div className="stack" role="status" style={{ gap: '0.5rem' }}>
          <strong>{t('dictation.done')}</strong>
          <button type="button" className="btn" onClick={() => setQueue(null)}>
            {t('finished')}
          </button>
        </div>
      )}
    </section>
  );
}
