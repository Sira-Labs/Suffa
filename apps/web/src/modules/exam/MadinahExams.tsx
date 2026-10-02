/**
 * "Prüfung" in the Medina course (ADR-0025): each lesson has its own test on its page (meanings
 * and gap sentences, 80 % passes). This screen lists the lessons with their result and leads to
 * the next test.
 */
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { madinahProgress } from '@/services/courses';
import { useEnrollmentStore } from '@/state';

export function MadinahExams() {
  const exams = useEnrollmentStore((s) => s.exams);
  const { lessons, passed, next } = madinahProgress(exams);
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Prüfung</h1>
      <p className="muted" style={{ margin: 0 }}>
        Im Medina-Kurs hat jede Lektion ihren eigenen Test: Bedeutungen und Lückensätze,
        ab 80 % bestanden. {passed} von {lessons.length} Lektionen bestanden.
      </p>
      {next && (
        <Link
          to={`/units/madinah/${next.lesson.lesson}`}
          className="btn btn-primary btn-lg"
        >
          Zum Test von Lektion {next.lesson.lesson}
          <Icon name="arrowRight" size={20} />
        </Link>
      )}
      <ul className="card stack" aria-label="Lektionstests" style={{ listStyle: 'none' }}>
        {lessons.map(({ lesson, topic, passed: done }) => (
          <li key={lesson.unit}>
            <Link
              to={`/units/madinah/${lesson.lesson}`}
              className="row"
              style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}
            >
              <span>
                Lektion {lesson.lesson}
                {topic && <span className="muted"> · {topic}</span>}
              </span>
              <span className={done ? 'feedback-good' : 'muted'}>
                {done ? '✓ bestanden' : 'offen'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
