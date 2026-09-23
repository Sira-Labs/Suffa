import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExamFormat, ExamItemResult } from '@/types';
import { ArabicText, RecallInput } from '@/components';
import { gradeRecall, isCorrect } from '@/services/srs';
import { speakArabic } from '@/services/speech';
import { examRepo, cardRepo } from '@/services/storage';
import { cardId, createCard } from '@/services/srs';
import { unitInfos } from '@/content';
import { useSrsStore, useSyncStore } from '@/state';
import { generateExam, type ExamQuestion } from './examEngine';

const FORMAT_LABELS: Record<ExamFormat, string> = {
  vocab_ar_de: 'Vokabel AR→DE',
  vocab_de_ar: 'Vokabel DE→AR',
  plural: 'Plural-Test',
  root: 'Wurzel-Test',
  conjugation: 'Konjugationstest',
  listening: 'Hörtest',
  reading: 'Leseverständnis',
  writing: 'Schreib-/Diktattest',
  speaking: 'Sprechtest',
  minimalpair: 'Minimalpaar-Hörtest',
  mixed_chapter: 'Gemischte Kapitelprüfung',
  speed: 'Speed-Round',
  adaptive: 'Adaptiver Modus',
};

type Stage = 'config' | 'running' | 'result';

const PRESET_FORMATS: ExamFormat[] = [
  'vocab_ar_de',
  'vocab_de_ar',
  'plural',
  'root',
  'conjugation',
  'listening',
  'reading',
  'writing',
  'speaking',
  'minimalpair',
];

export function Exam() {
  const [stage, setStage] = useState<Stage>('config');
  const [selectedFormats, setSelectedFormats] = useState<ExamFormat[]>([
    'vocab_ar_de',
    'plural',
    'root',
  ]);
  const [selectedUnits, setSelectedUnits] = useState<number[]>(
    unitInfos.map((u) => u.einheit)
  );
  const [count, setCount] = useState(10);
  const [speed, setSpeed] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [items, setItems] = useState<ExamItemResult[]>([]);

  const start = (formats: ExamFormat[], units: number[], n: number, isSpeed: boolean) => {
    const qs = generateExam({
      formats,
      units,
      count: n,
      secondsPerQuestion: isSpeed ? 8 : 0,
    });
    if (qs.length === 0) return;
    setQuestions(qs);
    setItems([]);
    setSpeed(isSpeed);
    setStage('running');
  };

  if (stage === 'config') {
    return (
      <ExamConfig
        selectedFormats={selectedFormats}
        setSelectedFormats={setSelectedFormats}
        selectedUnits={selectedUnits}
        setSelectedUnits={setSelectedUnits}
        count={count}
        setCount={setCount}
        onStart={start}
      />
    );
  }

  if (stage === 'running') {
    return (
      <ExamRunner
        questions={questions}
        speed={speed}
        onFinish={(results) => {
          setItems(results);
          setStage('result');
        }}
      />
    );
  }

  return (
    <ExamResultView
      items={items}
      formats={selectedFormats}
      units={selectedUnits}
      onRestart={() => setStage('config')}
    />
  );
}

function ExamConfig(props: {
  selectedFormats: ExamFormat[];
  setSelectedFormats: (f: ExamFormat[]) => void;
  selectedUnits: number[];
  setSelectedUnits: (u: number[]) => void;
  count: number;
  setCount: (n: number) => void;
  onStart: (f: ExamFormat[], u: number[], n: number, speed: boolean) => void;
}) {
  const toggleFormat = (f: ExamFormat) =>
    props.setSelectedFormats(
      props.selectedFormats.includes(f)
        ? props.selectedFormats.filter((x) => x !== f)
        : [...props.selectedFormats, f]
    );
  const toggleUnit = (u: number) =>
    props.setSelectedUnits(
      props.selectedUnits.includes(u)
        ? props.selectedUnits.filter((x) => x !== u)
        : [...props.selectedUnits, u]
    );

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Prüfungsmodus</h1>
      <p className="muted">
        Wähle Formate und Einheiten. Die Fragen werden interleaved gestellt (verschiedene
        Formate gemischt) – wie in der echten Klassenprüfung.
      </p>

      <div className="card stack">
        <strong>Formate</strong>
        <div className="row">
          {PRESET_FORMATS.map((f) => (
            <button
              key={f}
              className={`btn ${props.selectedFormats.includes(f) ? 'btn-accent' : ''}`}
              onClick={() => toggleFormat(f)}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <strong>Einheiten (gemischte Kapitelprüfung)</strong>
        <div className="row">
          {unitInfos.map((u) => (
            <button
              key={u.einheit}
              className={`btn ${props.selectedUnits.includes(u.einheit) ? 'btn-accent' : ''}`}
              onClick={() => toggleUnit(u.einheit)}
            >
              E{u.einheit}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Beispiel echte Prüfung: „Kapitel 1 → Kapitel 3 Dialog 1“ – wähle E1–E3.
        </p>
      </div>

      <div className="card stack">
        <strong>Umfang</strong>
        <label className="row">
          Anzahl Fragen:
          <input
            className="input"
            type="number"
            min={1}
            max={50}
            value={props.count}
            onChange={(e) => props.setCount(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </label>
      </div>

      <div className="row">
        <button
          className="btn btn-primary"
          disabled={props.selectedFormats.length === 0}
          onClick={() =>
            props.onStart(props.selectedFormats, props.selectedUnits, props.count, false)
          }
        >
          Prüfung starten
        </button>
        <button
          className="btn"
          disabled={props.selectedFormats.length === 0}
          onClick={() =>
            props.onStart(props.selectedFormats, props.selectedUnits, props.count, true)
          }
        >
          ⏱ Speed-Round (8 s/Frage)
        </button>
        <button
          className="btn"
          onClick={() =>
            props.onStart(PRESET_FORMATS, props.selectedUnits, props.count, false)
          }
        >
          🎲 Adaptiv / alles gemischt
        </button>
      </div>
    </div>
  );
}

function ExamRunner({
  questions,
  speed,
  onFinish,
}: {
  questions: ExamQuestion[];
  speed: boolean;
  onFinish: (items: ExamItemResult[]) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<ExamItemResult[]>([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [secondsLeft, setSecondsLeft] = useState(speed ? 8 : 0);
  const q = questions[idx]!;

  const submit = (given: string) => {
    // Multiple choice: the chosen option must be the expected one; typed answers are graded
    // tolerantly (tashkīl for Arabic, meanings/typos for translations).
    const correct = q.options
      ? given === q.expected
      : isCorrect(gradeRecall(given, q.expected, q.expectedIsArabic).verdict);
    const item: ExamItemResult = {
      contentRef: q.contentRef,
      format: q.format,
      prompt: q.prompt,
      expected: q.expected,
      given,
      correct,
      durationMs: Date.now() - startedAt,
    };
    const nextResults = [...results, item];
    setResults(nextResults);
    if (idx + 1 >= questions.length) {
      onFinish(nextResults);
    } else {
      setIdx(idx + 1);
      setValue('');
      setStartedAt(Date.now());
      setSecondsLeft(speed ? 8 : 0);
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (!speed) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          submitRef.current(value || '—');
          return 8;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, speed]);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="badge">
          Frage {idx + 1} / {questions.length}
        </span>
        <span className="badge">{FORMAT_LABELS[q.format]}</span>
        {speed && <span className="badge feedback-warn">⏱ {secondsLeft}s</span>}
      </div>

      <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        {q.format === 'listening' || q.format === 'minimalpair' ? (
          <button className="btn btn-primary" onClick={() => speakArabic(q.prompt)}>
            🔊 Anhören
          </button>
        ) : q.promptIsArabic ? (
          <ArabicText size="lg" onClick={() => speakArabic(q.prompt)}>
            {q.prompt}
          </ArabicText>
        ) : (
          <p style={{ fontSize: '1.3rem' }}>{q.prompt}</p>
        )}
        {q.hint && <span className="muted">{q.hint}</span>}

        {q.options ? (
          <div className="stack" style={{ width: '100%' }}>
            {q.options.map((opt) => (
              <button
                key={opt}
                className={`btn ${q.expectedIsArabic ? 'arabic-inline' : ''}`}
                style={q.expectedIsArabic ? { fontSize: '1.3rem' } : undefined}
                onClick={() => submit(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <RecallInput
              value={value}
              onChange={setValue}
              onSubmit={() => submit(value)}
              arabic={q.expectedIsArabic}
              autoFocus
            />
            <button
              className="btn btn-primary"
              style={{ marginTop: '0.75rem' }}
              onClick={() => submit(value)}
            >
              Antworten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExamResultView({
  items,
  formats,
  units,
  onRestart,
}: {
  items: ExamItemResult[];
  formats: ExamFormat[];
  units: number[];
  onRestart: () => void;
}) {
  const reloadSrs = useSrsStore((s) => s.load);
  const refreshPending = useSyncStore((s) => s.refreshPending);
  const score = items.filter((i) => i.correct).length;
  const wrong = items.filter((i) => !i.correct);
  const savedRef = useRef(false);

  const byFormat = useMemo(() => {
    const map = new Map<ExamFormat, { correct: number; total: number }>();
    for (const item of items) {
      const e = map.get(item.format) ?? { correct: 0, total: 0 };
      e.total++;
      if (item.correct) e.correct++;
      map.set(item.format, e);
    }
    return [...map.entries()];
  }, [items]);

  useEffect(() => {
    if (savedRef.current || items.length === 0) return;
    savedRef.current = true;
    void persistResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistResult = async () => {
    const now = new Date().toISOString();
    await examRepo.add({
      format: formats.length > 1 ? 'mixed_chapter' : (formats[0] ?? 'mixed_chapter'),
      units,
      score,
      total: items.length,
      items,
      startedAt: now,
      finishedAt: now,
    });
    // Schwierige Items → SRS: zugehörige Karte sofort fällig + als Leech markieren.
    for (const item of wrong) {
      const kind =
        item.format === 'plural'
          ? 'plural'
          : item.format === 'root'
            ? 'root_to_word'
            : item.format === 'conjugation'
              ? 'conjugation'
              : item.format === 'vocab_de_ar' || item.format === 'writing'
                ? 'vocab_de_ar'
                : 'vocab_ar_de';
      const id = cardId(kind, item.contentRef);
      const existing = await cardRepo.get(id);
      if (existing) {
        await cardRepo.put({
          ...existing,
          due: new Date().toISOString(),
          leech: true,
          interval: 0,
        });
      } else {
        await cardRepo.put({
          ...createCard({ id, contentRef: item.contentRef, kind }),
          leech: true,
        });
      }
    }
    await reloadSrs();
    await refreshPending();
  };

  const exportResult = () => {
    const payload = {
      lehrwerk: 'العربية بين يديك – Buch 1',
      einheiten: units,
      formate: formats,
      punkte: score,
      gesamt: items.length,
      prozent: Math.round((score / items.length) * 100),
      datum: new Date().toISOString(),
      details: items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pruefung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = items.length > 0 ? Math.round((score / items.length) * 100) : 0;

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Auswertung</h1>
      <div className="card" style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            color: pct >= 70 ? 'var(--good)' : 'var(--warn)',
          }}
        >
          {score} / {items.length} ({pct} %)
        </div>
        <p className="muted">
          {wrong.length} schwierige Items wurden automatisch zur Wiederholung (SRS)
          markiert.
        </p>
      </div>

      <div className="card stack">
        <strong>Fehleranalyse nach Format</strong>
        {byFormat.map(([fmt, e]) => (
          <div key={fmt} className="row" style={{ justifyContent: 'space-between' }}>
            <span>{FORMAT_LABELS[fmt]}</span>
            <span className={e.correct === e.total ? 'feedback-good' : 'feedback-warn'}>
              {e.correct} / {e.total}
            </span>
          </div>
        ))}
      </div>

      {wrong.length > 0 && (
        <div className="card stack">
          <strong>Falsch beantwortet</strong>
          {wrong.map((item, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">{item.prompt}</span>
              <span>
                <span className="feedback-bad arabic-inline">{item.given || '—'}</span>
                {' → '}
                <span className="feedback-good arabic-inline">{item.expected}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <button className="btn btn-primary" onClick={onRestart}>
          Neue Prüfung
        </button>
        <button className="btn" onClick={exportResult}>
          📤 Ergebnis exportieren (für Lehrer)
        </button>
      </div>
    </div>
  );
}
