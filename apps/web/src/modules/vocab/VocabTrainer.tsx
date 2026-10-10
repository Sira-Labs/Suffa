import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardKind } from '@/types';
import { TashkilToggle } from '@/components';
import { ReviewSession } from './ReviewSession';
import { AddVocabForm } from './AddVocabForm';

type Mode = {
  id: 'ar_de' | 'de_ar' | 'plural' | 'root' | 'nisba' | 'all';
  kinds: CardKind[];
  aid?: boolean;
};

const MODES: Mode[] = [
  { id: 'ar_de', kinds: ['vocab_ar_de'], aid: true },
  { id: 'de_ar', kinds: ['vocab_de_ar'] },
  { id: 'plural', kinds: ['plural'] },
  { id: 'root', kinds: ['root_to_word'] },
  { id: 'nisba', kinds: ['nisba'] },
  {
    id: 'all',
    kinds: ['vocab_ar_de', 'vocab_de_ar', 'plural', 'root_to_word', 'nisba'],
  },
];

export function VocabTrainer() {
  const { t } = useTranslation(['vocab', 'common']);
  const [mode, setMode] = useState<Mode>(MODES[0]!);
  const [showAdd, setShowAdd] = useState(false);
  // key forces a remount of the session on mode change (fresh queue).
  const [sessionKey, setSessionKey] = useState(0);

  const pick = (m: Mode) => {
    setMode(m);
    setSessionKey((k) => k + 1);
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>{t('trainer.title')}</h1>
        <button className="btn" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? t('common:close') : t('trainer.add')}
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
            {t(`modes.${m.id}`)}
          </button>
        ))}
      </div>

      {showAdd && <AddVocabForm onDone={() => setShowAdd(false)} />}

      <ReviewSession
        key={sessionKey}
        kinds={mode.kinds}
        title={t('trainer.mode', { label: t(`modes.${mode.id}`) })}
        allowRecognitionAid={mode.aid}
      />
    </div>
  );
}
