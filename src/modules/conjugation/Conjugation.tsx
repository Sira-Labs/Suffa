import { useMemo, useState } from 'react';
import type { ConjugationTable, MadiPerson, Verb } from '@/types';
import { PERSON_LABELS, AMR_LABELS } from '@/types';
import { ArabicText, Feedback, RecallInput } from '@/components';
import { content } from '@/content';
import { diffArabic, gradeAnswer, type AnswerVerdict } from '@/services/srs';
import { speakArabic } from '@/services/speech';

type Tense = 'madi' | 'mudari' | 'amr';

const TENSE_LABEL: Record<Tense, string> = {
  madi: 'الماضي (Vergangenheit)',
  mudari: 'المضارع (Gegenwart)',
  amr: 'الأمر (Imperativ)',
};

const PERSON_ORDER: MadiPerson[] = [
  'ana',
  'nahnu',
  'anta',
  'anti',
  'antuma',
  'antum',
  'antunna',
  'huwa',
  'hiya',
  'huma_m',
  'huma_f',
  'hum',
  'hunna',
];

export function Conjugation() {
  const verbs = content.verben;
  const [verb, setVerb] = useState<Verb>(verbs[0]!);
  const [tense, setTense] = useState<Tense>('madi');
  const [mode, setMode] = useState<'table' | 'drill'>('table');

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Konjugationstrainer</h1>
      <div className="row">
        {verbs.map((v) => (
          <button
            key={v.id}
            className={`btn arabic-inline ${v.id === verb.id ? 'btn-accent' : ''}`}
            style={{ fontSize: '1.2rem' }}
            onClick={() => setVerb(v)}
          >
            {v.lemma}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <ArabicText size="lg" onClick={() => speakArabic(verb.lemma)}>
              {verb.lemma}
            </ArabicText>
            <div className="muted">{verb.de}</div>
          </div>
          <span className="badge">
            Wurzel <span className="arabic-inline">{verb.wurzel}</span> · {verb.wazn}
          </span>
        </div>
        {verb.hinweis && <p className="muted">{verb.hinweis}</p>}
      </div>

      <div className="row">
        {(['madi', 'mudari', 'amr'] as Tense[]).map((t) => (
          <button
            key={t}
            className={`btn ${t === tense ? 'btn-accent' : ''}`}
            onClick={() => setTense(t)}
          >
            {TENSE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          className={`btn ${mode === 'table' ? 'btn-primary' : ''}`}
          onClick={() => setMode('table')}
        >
          Tabelle
        </button>
        <button
          className={`btn ${mode === 'drill' ? 'btn-primary' : ''}`}
          onClick={() => setMode('drill')}
        >
          Lückentraining
        </button>
      </div>

      {mode === 'table' ? (
        <ConjugationGrid verb={verb} tense={tense} />
      ) : (
        <ConjugationDrill verb={verb} tense={tense} />
      )}
    </div>
  );
}

function ConjugationGrid({ verb, tense }: { verb: Verb; tense: Tense }) {
  if (tense === 'amr') {
    return (
      <div
        className="card grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))' }}
      >
        {(Object.keys(AMR_LABELS) as (keyof typeof AMR_LABELS)[]).map((p) => (
          <div key={p} className="card" style={{ background: 'var(--bg-elev-2)' }}>
            <div className="muted">
              {AMR_LABELS[p].de} <span className="arabic-inline">{AMR_LABELS[p].ar}</span>
            </div>
            <ArabicText onClick={() => speakArabic(verb.amr[p])}>
              {verb.amr[p]}
            </ArabicText>
          </div>
        ))}
      </div>
    );
  }
  const table: ConjugationTable = verb[tense];
  return (
    <div
      className="card grid"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))' }}
    >
      {PERSON_ORDER.map((p) => (
        <div key={p} className="card" style={{ background: 'var(--bg-elev-2)' }}>
          <div className="muted">
            {PERSON_LABELS[p].de}{' '}
            <span className="arabic-inline">{PERSON_LABELS[p].ar}</span>
          </div>
          <ArabicText onClick={() => speakArabic(table[p])}>{table[p]}</ArabicText>
        </div>
      ))}
    </div>
  );
}

function ConjugationDrill({ verb, tense }: { verb: Verb; tense: Tense }) {
  const persons = useMemo(
    () =>
      tense === 'amr'
        ? (Object.keys(AMR_LABELS) as string[])
        : (PERSON_ORDER as string[]),
    [tense]
  );
  const [pi, setPi] = useState(0);
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);

  const person = persons[pi % persons.length]!;
  const expected =
    tense === 'amr'
      ? verb.amr[person as keyof typeof verb.amr]
      : verb[tense][person as MadiPerson];
  const label =
    tense === 'amr'
      ? AMR_LABELS[person as keyof typeof AMR_LABELS]
      : PERSON_LABELS[person as MadiPerson];

  const next = () => {
    setPi((x) => (x + 1) % persons.length);
    setValue('');
    setVerdict(null);
  };

  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <p className="muted">
        Konjugiere <ArabicText>{verb.lemma}</ArabicText> · {TENSE_LABEL[tense]} ·{' '}
        <strong>
          {label.de} <span className="arabic-inline">{label.ar}</span>
        </strong>
      </p>
      <div style={{ width: '100%' }}>
        <RecallInput
          value={value}
          onChange={setValue}
          onSubmit={() => setVerdict(gradeAnswer(value, expected))}
          autoFocus
        />
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          onClick={() => setVerdict(gradeAnswer(value, expected))}
        >
          Prüfen
        </button>
        <button className="btn" onClick={next}>
          Nächste Form
        </button>
      </div>
      {verdict && (
        <Feedback
          verdict={verdict}
          expected={expected}
          diff={diffArabic(value, expected)}
        />
      )}
    </div>
  );
}
