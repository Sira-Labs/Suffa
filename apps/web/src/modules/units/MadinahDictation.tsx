/**
 * "Diktat" on a Medina lesson (ADR-0025, stage 2): hear a word of the lesson and write it in
 * Arabic. Vowel signs are optional, as in the unit writing station. A word written right is
 * stored once as practice (skill `write`, unit = the lesson unit) and earns XP.
 */
import { useMemo, useState } from 'react';
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
          title: 'Alle Wörter der Lektion geschrieben',
          xp: outcome.xp,
          big: true,
        });
      } else if (outcome.first) {
        celebrate({ title: 'Richtig geschrieben', xp: outcome.xp, big: false });
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
    <section className="card stack" aria-label="Diktat">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>Diktat</strong>
        <span className="muted">
          {done} von {words.length} geschrieben
        </span>
      </div>

      {!queue && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Hör das Wort und schreib es auf Arabisch. Vokalzeichen sind freiwillig.
          </p>
          <button type="button" className="btn btn-primary" onClick={start}>
            {done === 0
              ? 'Diktat starten'
              : done < words.length
                ? 'Weiter schreiben'
                : 'Nochmal schreiben'}
          </button>
        </>
      )}

      {queue && current && (
        <div className="stack" style={{ gap: '0.75rem', alignItems: 'center' }}>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={() => speakArabic(current.ar)}>
              Nochmal hören
            </button>
            {!solved && (
              <button type="button" className="btn" onClick={() => setShown(true)}>
                Wort zeigen
              </button>
            )}
          </div>
          {(shown || !isTtsSupported()) && !solved && (
            <span className="muted">
              {isTtsSupported() ? 'Das Wort:' : 'Keine Sprachausgabe – das Wort:'}{' '}
              <ArabicText>{current.ar}</ArabicText>
            </span>
          )}
          <div style={{ width: '100%' }}>
            <RecallInput
              value={value}
              onChange={setValue}
              onSubmit={solved ? next : check}
              placeholder="Hier schreiben…"
              disabled={solved}
            />
          </div>
          <div className="row">
            {solved ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                Weiter
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={check}>
                  Prüfen
                </button>
                <button type="button" className="btn" onClick={next}>
                  Später
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
            Noch {queue.length} {queue.length === 1 ? 'Wort' : 'Wörter'} in dieser Runde
          </p>
        </div>
      )}

      {queue && !current && (
        <div className="stack" role="status" style={{ gap: '0.5rem' }}>
          <strong>Diktat geschafft!</strong>
          <button type="button" className="btn" onClick={() => setQueue(null)}>
            Fertig
          </button>
        </div>
      )}
    </section>
  );
}
