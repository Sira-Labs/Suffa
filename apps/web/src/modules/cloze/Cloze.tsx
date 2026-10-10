import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ExampleCatalog, UnitPracticeScope, Vokabel } from '@/types';
import { TaskQueue } from '@/components/TaskQueue';
import { content } from '@/content';
import { loadExamples } from '@/services/examples';
import { clozeChoices, clozeFor, scopedWords, type ClozeTask } from '@/services/practice';
import { speakArabic } from '@/services/speech';
import { logger } from '@/services/logger';

const log = logger.child('cloze');

/**
 * Cloze ("Lückentext"): a real example sentence with the word blanked out; the learner picks
 * it from four words of the unit. Inside a unit it uses that unit's (or section's) words and
 * reports every sentence completed on the first correct pick.
 */
export function Cloze({ scope }: { scope: UnitPracticeScope }) {
  const { t } = useTranslation('cloze');
  const [catalog, setCatalog] = useState<ExampleCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    loadExamples()
      .then((c) => !cancelled && setCatalog(c))
      .catch((error: unknown) => {
        log.error('Example sentences could not be loaded', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const words = useMemo(() => scopedWords(content.vokabeln, scope), [scope]);
  // Distractors come from the whole unit, so a short section still has four choices.
  const pool = useMemo(
    () => content.vokabeln.filter((v) => v.einheit === scope.unit),
    [scope.unit]
  );
  const tasks = useMemo(() => {
    if (!catalog) return new Map<string, ClozeTask>();
    return new Map(
      words.flatMap((w) => {
        const task = clozeFor(w, catalog.examples[w.id] ?? []);
        return task ? [[w.id, task] as const] : [];
      })
    );
  }, [catalog, words]);

  if (failed) return <p className="muted">{t('loadFailed')}</p>;
  if (!catalog) return <p className="muted">{t('loading')}</p>;
  if (tasks.size === 0) {
    return <p className="muted">{t('none')}</p>;
  }

  const isDone = (id: string) => solved.has(id) || Boolean(scope.isPractised?.(id));
  const markDone = (id: string) => {
    if (solved.has(id)) return;
    setSolved((prev) => new Set(prev).add(id));
    scope.onPractised(id);
  };
  const byId = new Map(words.map((w) => [w.id, w]));

  return (
    <TaskQueue
      ids={[...tasks.keys()]}
      isDone={isDone}
      complete={
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <strong className="feedback-good">{t('allDone')}</strong>
          <Link to={`/units/${scope.unit}`} className="btn btn-primary">
            {t('backToUnit')}
          </Link>
        </div>
      }
    >
      {(id, position, next) => (
        <ClozeCard
          key={id}
          task={tasks.get(id)!}
          word={byId.get(id)!}
          pool={pool}
          position={position}
          onCorrect={() => markDone(id)}
          onNext={next}
        />
      )}
    </TaskQueue>
  );
}

function ClozeCard({
  task,
  word,
  pool,
  position,
  onCorrect,
  onNext,
}: {
  task: ClozeTask;
  word: Vokabel;
  pool: Vokabel[];
  position: string;
  onCorrect(): void;
  onNext(): void;
}) {
  const { t } = useTranslation(['cloze', 'common']);
  const choices = useMemo(() => clozeChoices(word, pool), [word, pool]);
  const [wrong, setWrong] = useState<ReadonlySet<string>>(() => new Set());
  const [correct, setCorrect] = useState(false);
  const sentence = `${task.before}${task.gap}${task.after}`;

  const pick = (choice: Vokabel) => {
    if (correct) return;
    if (choice.id === word.id) {
      setCorrect(true);
      onCorrect();
      speakArabic(sentence);
    } else {
      setWrong((prev) => new Set(prev).add(choice.id));
    }
  };

  return (
    <div className="card stack cloze-card">
      <p className="muted" style={{ margin: 0 }}>
        {t('prompt', { position })}
      </p>
      <p lang="ar" dir="rtl" className="arabic cloze-sentence">
        {task.before}
        {correct ? (
          <mark className="cloze-filled">{task.gap}</mark>
        ) : (
          <span className="cloze-gap" aria-label={t('gap')}>
            ＿＿＿
          </span>
        )}
        {task.after}
      </p>
      <p style={{ margin: 0 }}>{t('quote', { text: task.de })}</p>
      <div className="cloze-choices" role="group" aria-label={t('choices')}>
        {choices.map((choice) => (
          <button
            key={choice.id}
            lang="ar"
            dir="rtl"
            className={`btn arabic-inline cloze-choice${
              correct && choice.id === word.id ? ' btn-accent' : ''
            }${wrong.has(choice.id) ? ' cloze-choice-wrong' : ''}`}
            disabled={wrong.has(choice.id) || (correct && choice.id !== word.id)}
            onClick={() => pick(choice)}
          >
            {choice.ar}
          </button>
        ))}
      </div>
      {correct ? (
        <>
          <span className="feedback-good">
            {t('correct', { arabic: word.ar, meaning: word.de })}
          </span>
          <button className="btn btn-primary" onClick={onNext}>
            {t('common:continue')}
          </button>
        </>
      ) : (
        <>
          {wrong.size > 0 && <span className="feedback-bad">{t('wrong')}</span>}
          <button className="btn" style={{ alignSelf: 'start' }} onClick={onNext}>
            {t('skip')}
          </button>
        </>
      )}
    </div>
  );
}
