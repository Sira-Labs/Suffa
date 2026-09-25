/**
 * Entry to the live quiz (story 14.4) on the class page: the teacher opens the projector
 * view; learners see a banner while a quiz is running.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuizApi } from '@/services/classes/quizApi';

export function QuizEntry({ classId, teacher }: { classId: string; teacher: boolean }) {
  const api = useMemo(() => new QuizApi(), []);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (teacher) return;
    let cancelled = false;
    void api.view(classId).then((r) => {
      if (!cancelled && r.ok) {
        setRunning(r.value.quiz !== null && r.value.quiz.status !== 'finished');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, classId, teacher]);

  if (teacher) {
    return (
      <section className="card row" style={{ justifyContent: 'space-between' }}>
        <span className="stack" style={{ gap: 0 }}>
          <strong>Live-Quiz</strong>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Für den Beamer: Problemwörter der Klasse, Antworten per Handy
          </span>
        </span>
        <Link className="btn btn-primary" to={`/classes/${classId}/quiz`}>
          Öffnen
        </Link>
      </section>
    );
  }
  if (!running) return null;
  return (
    <Link className="card row quiz-banner" to={`/classes/${classId}/quiz`}>
      <strong>Live-Quiz läuft</strong>
      <span>Mitmachen →</span>
    </Link>
  );
}
