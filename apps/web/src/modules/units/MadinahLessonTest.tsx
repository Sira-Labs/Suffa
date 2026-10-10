/**
 * "Lektionstest" of a Medina lesson (ADR-0025, stage 2): up to six meanings and the lesson's gap
 * sentences, each answered once. The result is stored like a unit test (exam format
 * `madinah_lesson`, units = [the lesson's unit]); 80 % passes (`PASS_RATIO`).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PASS_RATIO } from '@suffa/engagement';
import { ArabicText } from '@/components';
import type { MadinahLessonContent } from '@/services/courses';
import { randomShuffle } from '@/services/practice';
import { examRepo } from '@/services/storage';
import { useEnrollmentStore } from '@/state';
import type { ExamItemResult } from '@/types';
import { GAP, GapSentence, gapId, gapOptions } from './MadinahGaps';
import { meaningOptions } from './MadinahWordPractice';

export const LESSON_TEST_FORMAT = 'madinah_lesson';
const MEANINGS = 6;

export interface TestQuestion {
  ref: string;
  kind: 'meaning' | 'gap';
  /** What the learner sees: the word, or the sentence with its gap. */
  prompt: string;
  /** German help for a gap sentence. */
  hint?: string;
  expected: string;
  options: string[];
}

/** The questions of one attempt: some meanings (random per attempt) and every gap sentence. */
export function buildLessonTest(
  content: Pick<MadinahLessonContent, 'words' | 'gaps'>,
  random: () => number = Math.random
): TestQuestion[] {
  const meanings = randomShuffle(content.words, random)
    .slice(0, MEANINGS)
    .map<TestQuestion>((w) => ({
      ref: w.id,
      kind: 'meaning',
      prompt: w.ar,
      expected: w.de,
      options: meaningOptions(w, content.words),
    }));
  const gaps = content.gaps.map<TestQuestion>((g, i) => ({
    ref: gapId(i),
    kind: 'gap',
    prompt: g.ar,
    hint: g.de,
    expected: g.answer,
    options: gapOptions(g, i),
  }));
  return [...meanings, ...gaps];
}

export function MadinahLessonTest({
  unit,
  content,
}: {
  unit: number;
  content: MadinahLessonContent;
}) {
  const { t } = useTranslation('units');
  const exams = useEnrollmentStore((s) => s.exams);
  const best = useMemo(() => {
    const mine = exams.filter(
      (e) =>
        e.format === LESSON_TEST_FORMAT && e.units.length === 1 && e.units[0] === unit
    );
    return mine.reduce<(typeof mine)[number] | null>(
      (top, e) => (!top || e.score / e.total > top.score / top.total ? e : top),
      null
    );
  }, [exams, unit]);

  const [questions, setQuestions] = useState<TestQuestion[] | null>(null);
  const [answers, setAnswers] = useState<ExamItemResult[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState('');
  const [shownAt, setShownAt] = useState(0);
  const current = questions?.[answers.length];
  const finished = questions !== null && !current;
  const score = answers.filter((a) => a.correct).length;

  const start = () => {
    setQuestions(buildLessonTest(content));
    setAnswers([]);
    setChosen(null);
    setStartedAt(new Date().toISOString());
    setShownAt(Date.now());
  };

  const choose = (option: string) => {
    if (current && !chosen) setChosen(option);
  };

  const next = () => {
    if (!questions || !current || chosen === null) return;
    const result: ExamItemResult = {
      contentRef: current.ref,
      format: current.kind === 'meaning' ? 'vocab_ar_de' : 'reading',
      prompt: current.prompt,
      expected: current.expected,
      given: chosen,
      correct: chosen === current.expected,
      durationMs: Date.now() - shownAt,
    };
    const all = [...answers, result];
    setAnswers(all);
    setChosen(null);
    setShownAt(Date.now());
    if (all.length === questions.length) void save(all);
  };

  const save = async (items: ExamItemResult[]) => {
    await examRepo.add({
      format: LESSON_TEST_FORMAT,
      units: [unit],
      score: items.filter((i) => i.correct).length,
      total: items.length,
      items,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    await useEnrollmentStore.getState().reloadExams();
  };

  const passed = questions !== null && score / questions.length >= PASS_RATIO;

  return (
    <section className="card stack" aria-label={t('lessonTest.title')}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>{t('lessonTest.title')}</strong>
        {best && (
          <span className="muted">
            {best.score / best.total >= PASS_RATIO
              ? t('lessonTest.bestPassed', { score: best.score, total: best.total })
              : t('lessonTest.best', { score: best.score, total: best.total })}
          </span>
        )}
      </div>

      {!questions && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {t('lessonTest.intro', { percent: Math.round(PASS_RATIO * 100) })}
          </p>
          <button type="button" className="btn btn-primary" onClick={start}>
            {best ? t('lessonTest.retake') : t('lessonTest.start')}
          </button>
        </>
      )}

      {current && (
        <div className="stack" style={{ gap: '0.75rem' }}>
          <span className="muted" style={{ textAlign: 'center' }}>
            {t('lessonTest.questionOf', {
              index: answers.length + 1,
              total: questions!.length,
            })}
          </span>
          {current.kind === 'meaning' ? (
            <div style={{ textAlign: 'center' }}>
              <ArabicText size="hero">{current.prompt}</ArabicText>
            </div>
          ) : (
            <>
              <GapSentence
                gap={{
                  ar: current.prompt,
                  answer: current.expected,
                  options: current.options,
                  de: current.hint ?? '',
                }}
              />
              <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
                {current.hint}
              </p>
            </>
          )}
          <div
            className="grid"
            role="group"
            aria-label={t('lessonTest.choose')}
            style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
          >
            {current.options.map((option) => (
              <button
                key={option}
                type="button"
                lang={current.kind === 'gap' ? 'ar' : undefined}
                dir={current.kind === 'gap' ? 'rtl' : undefined}
                className={`btn pattern-option ${current.kind === 'gap' ? 'arabic-inline' : ''} ${option === chosen ? 'chosen' : ''}`}
                aria-pressed={option === chosen}
                onClick={() => choose(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={chosen === null}
            onClick={next}
          >
            {answers.length + 1 === questions!.length
              ? t('lessonTest.submit')
              : t('next')}
          </button>
        </div>
      )}

      {finished && (
        <div className="stack" role="status" style={{ gap: '0.5rem' }}>
          <strong className={passed ? 'feedback-good' : 'feedback-bad'}>
            {passed ? t('lessonTest.passed') : t('lessonTest.notPassed')}{' '}
            {t('lessonTest.result', { score, total: questions!.length })}
          </strong>
          {answers.some((a) => !a.correct) && (
            <ul
              className="stack"
              style={{ margin: 0, paddingLeft: '1.1rem', gap: '0.3rem' }}
            >
              {answers
                .filter((a) => !a.correct)
                .map((a) => (
                  <li key={a.contentRef}>
                    <span lang="ar" dir="rtl" className="arabic-inline">
                      {a.prompt.replace(GAP, '…')}
                    </span>{' '}
                    {t('lessonTest.rightAnswer')}{' '}
                    <span className="arabic-inline">{a.expected}</span>
                  </li>
                ))}
            </ul>
          )}
          <button type="button" className="btn" onClick={() => setQuestions(null)}>
            {t('finished')}
          </button>
        </div>
      )}
    </section>
  );
}
