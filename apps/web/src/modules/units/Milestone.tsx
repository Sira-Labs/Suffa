import { Link, useParams } from 'react-router-dom';
import { content } from '@/content';
import { arabicNumber } from '@/services/units';
import { STAGES, stageTestPassed } from '@/services/enrollment';
import { XP_RULES } from '@/services/engagement/xp';
import { useEnrollmentStore, useSrsStore } from '@/state';

const PARTICLES = 14;

/**
 * Milestone screen after a passed stage test (step 3): a big medal, what the stage covered,
 * the stage bonus and the way on. Full screen, like the review focus mode.
 */
export function Milestone() {
  const { stage: param } = useParams();
  const stage = STAGES.find((s) => s.id === Number(param));
  const exams = useEnrollmentStore((s) => s.exams);
  const cards = useSrsStore((s) => s.cards);
  const passed = stage ? stageTestPassed(exams, stage) : null;

  if (!stage || !passed) {
    return (
      <div className="milestone stack">
        <h1>Noch nicht geschafft</h1>
        <p className="muted">Diese Etappe endet mit ihrem Test. Bestehe ihn mit 80 %.</p>
        <Link to="/units" className="btn btn-primary">
          Zu den Stufen
        </Link>
      </div>
    );
  }

  const stageWords = new Set(
    content.vokabeln.filter((v) => stage.units.includes(v.einheit)).map((v) => v.id)
  );
  const wordsLearned = cards.filter(
    (c) => c.kind === 'vocab_ar_de' && stageWords.has(c.contentRef) && c.reps > 0
  ).length;
  const percent = Math.round((passed.score / passed.total) * 100);
  const next = STAGES.find((s) => s.id === stage.id + 1);
  const isLast = !next || next.book !== stage.book;

  return (
    <div className="milestone" role="status" aria-live="polite">
      <div className="milestone-burst" aria-hidden>
        {Array.from({ length: PARTICLES }, (_, i) => (
          <span key={i} style={{ ['--i' as string]: i }} />
        ))}
      </div>
      <div className="milestone-medal" aria-hidden>
        <span className="arabic-display">{arabicNumber(stage.id)}</span>
      </div>
      <span className="eyebrow milestone-eyebrow">
        {isLast ? 'Stufe geschafft' : 'Etappe geschafft'}
      </span>
      <h1 className="milestone-title">
        Stufe {stage.book} · {stage.name}
        <br />
        abgeschlossen
      </h1>
      <p className="muted" style={{ margin: 0 }}>
        {stage.units.length} Einheiten, {stage.test} bestanden mit {percent} %.
        {wordsLearned > 0 && (
          <>
            {' '}
            <strong style={{ color: 'var(--text)' }}>{wordsLearned} Wörter</strong>{' '}
            gelernt.
          </>
        )}
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <span className="badge header-chip milestone-xp">
          +{XP_RULES.stageComplete} XP
        </span>
        <span className="badge header-chip">Abzeichen: {stage.badge}</span>
      </div>
      <div className="stack milestone-actions">
        {isLast ? (
          <Link to="/units" className="btn btn-primary btn-lg">
            Zur Stufenkarte
          </Link>
        ) : (
          <Link to={`/units/${next.units[0]}`} className="btn btn-primary btn-lg">
            {next.name} beginnen
          </Link>
        )}
        <Link to="/" className="btn">
          Später
        </Link>
      </div>
    </div>
  );
}
