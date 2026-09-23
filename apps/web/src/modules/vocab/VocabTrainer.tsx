import { useState } from 'react';
import type { CardKind } from '@/types';
import { TashkilToggle } from '@/components';
import { ReviewSession } from './ReviewSession';
import { AddVocabForm } from './AddVocabForm';

type Mode = {
  id: string;
  label: string;
  kinds: CardKind[];
  aid?: boolean;
};

const MODES: Mode[] = [
  { id: 'ar_de', label: 'AR → DE', kinds: ['vocab_ar_de'], aid: true },
  { id: 'de_ar', label: 'DE → AR', kinds: ['vocab_de_ar'] },
  { id: 'plural', label: 'Plural-Drill', kinds: ['plural'] },
  { id: 'root', label: 'Wurzel → Wort', kinds: ['root_to_word'] },
  { id: 'nisba', label: 'Nisba', kinds: ['nisba'] },
  {
    id: 'all',
    label: 'Alles gemischt',
    kinds: ['vocab_ar_de', 'vocab_de_ar', 'plural', 'root_to_word', 'nisba'],
  },
];

export function VocabTrainer() {
  const [mode, setMode] = useState<Mode>(MODES[0]!);
  const [showAdd, setShowAdd] = useState(false);
  // key erzwingt Remount der Session bei Moduswechsel (frische Queue).
  const [sessionKey, setSessionKey] = useState(0);

  const pick = (m: Mode) => {
    setMode(m);
    setSessionKey((k) => k + 1);
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Vokabeltrainer</h1>
        <button className="btn" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Schließen' : '+ Inhalt hinzufügen'}
        </button>
      </div>

      <TashkilToggle />

      <div className="row">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`btn ${m.id === mode.id ? 'btn-accent' : ''}`}
            onClick={() => pick(m)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {showAdd && <AddVocabForm onDone={() => setShowAdd(false)} />}

      <ReviewSession
        key={sessionKey}
        kinds={mode.kinds}
        title={`Modus: ${mode.label}`}
        allowRecognitionAid={mode.aid}
      />
    </div>
  );
}
