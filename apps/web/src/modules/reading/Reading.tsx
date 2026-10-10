import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Dialog, DialogZeile, UnitPracticeScope, Vokabel } from '@/types';
import { MeaningText, NotTranslated, TashkilToggle } from '@/components';
import { applyTashkilLevel } from '@/components/ArabicText';
import { content } from '@/content';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import { scopedDialogues } from '@/services/practice';
import { normalizeArabic } from '@/services/srs';
import { speakArabic } from '@/services/speech';
import { consistentMeanings, meaningOf, useMeaningLanguage } from '@/services/meanings';
import { useSettingsStore } from '@/state';

// Glossary from all vocabulary: normalised form → word.
const glossar = new Map<string, Vokabel>();
for (const v of content.vokabeln) {
  glossar.set(normalizeArabic(v.ar), v);
}

/**
 * Reading with tap-a-word glosses. With a `scope` (inside a unit) only that unit's or section's dialogues;
 * a dialogue counts as read once its comprehension question is answered correctly.
 */
export function Reading({ scope }: { scope?: UnitPracticeScope } = {}) {
  const { t } = useTranslation('reading');
  const { keep } = useReachedUnits();
  // Outside a unit: the dialogues of every unit reached so far.
  const dialoge = useMemo(
    () =>
      scope ? scopedDialogues(content.dialoge, scope) : content.dialoge.filter(keep),
    [scope, keep]
  );
  const [selected, setSelected] = useState<Dialog | undefined>(dialoge[0]);
  const [showTranslation, setShowTranslation] = useState(true);

  if (dialoge.length === 0) {
    return <p className="muted">{t('noText')}</p>;
  }

  return (
    <div className="stack">
      {!scope && <h1 style={{ margin: 0 }}>{t('title')}</h1>}
      <p className="muted">{t('intro')}</p>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {dialoge.map((d) => (
            <button
              key={d.id}
              className={`btn ${d.id === selected?.id ? 'btn-accent' : ''}`}
              onClick={() => setSelected(d)}
            >
              {t('dialogue', { unit: d.einheit, dialogue: d.dialog })}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setShowTranslation((v) => !v)}>
          {showTranslation ? t('translationOff') : t('translationOn')}
        </button>
      </div>

      <TashkilToggle />

      {selected && (
        <div className="card stack">
          <h2 className="arabic-inline" style={{ margin: 0 }}>
            {selected.titel}
          </h2>
          {selected.zeilen.map((zeile, i) => (
            <GlossLine key={i} line={zeile} showTranslation={showTranslation} />
          ))}
        </div>
      )}

      {selected && (
        <Comprehension
          key={selected.id}
          dialog={selected}
          onCorrect={() => scope?.onPractised(selected.id)}
        />
      )}
    </div>
  );
}

function GlossLine({
  line,
  showTranslation,
}: {
  line: DialogZeile;
  showTranslation: boolean;
}) {
  const { t } = useTranslation('reading');
  const level = useSettingsStore((s) => s.settings.tashkilLevel);
  const language = useMeaningLanguage();
  const { sp: speaker, ar: arabic } = line;
  const [gloss, setGloss] = useState<{ word: string; entry: Vokabel } | null>(null);
  const words = useMemo(() => arabic.split(/\s+/).filter(Boolean), [arabic]);

  return (
    <div className="card" style={{ background: 'var(--bg-elev-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="badge arabic-inline">{speaker}</span>
        <button
          className="btn"
          onClick={() => speakArabic(arabic)}
          aria-label={t('listenLine')}
        >
          🔊
        </button>
      </div>
      <p className="arabic" style={{ margin: '0.5rem 0' }}>
        {words.map((w, i) => {
          const entry = glossar.get(normalizeArabic(w));
          return (
            <span
              key={i}
              onClick={() => entry && setGloss({ word: w, entry })}
              role={entry ? 'button' : undefined}
              tabIndex={entry ? 0 : undefined}
              style={{
                cursor: entry ? 'pointer' : 'default',
                textDecoration: entry ? 'underline dotted var(--accent)' : 'none',
                margin: '0 0.15rem',
              }}
            >
              {applyTashkilLevel(w, level)}{' '}
            </span>
          );
        })}
      </p>
      {gloss && (
        <p className="muted" style={{ margin: 0 }}>
          <span className="arabic-inline">{gloss.word}</span> →{' '}
          <MeaningText meaning={meaningOf(gloss.entry, language)} /> ({t('root')}{' '}
          <span className="arabic-inline">{gloss.entry.wurzel}</span>)
        </p>
      )}
      {showTranslation && (
        <p className="muted" style={{ margin: 0 }}>
          <MeaningText meaning={meaningOf(line, language)} />
        </p>
      )}
    </div>
  );
}

/** Simple reading comprehension after the text. */
function Comprehension({ dialog, onCorrect }: { dialog: Dialog; onCorrect(): void }) {
  const { t } = useTranslation('reading');
  const language = useMeaningLanguage();
  const firstLine = dialog.zeilen[0];
  const [answer, setAnswer] = useState<string | null>(null);
  // The right line and two others, all in one language (German if one lacks English).
  const { correct, options, lang, missing } = useMemo(() => {
    if (!firstLine)
      return { correct: '', options: [], lang: 'de' as const, missing: false };
    const others = [
      ...new Map(
        content.dialoge
          .flatMap((d) => d.zeilen)
          .filter((z) => z.de !== firstLine.de)
          .map((z) => [z.de, z])
      ).values(),
    ]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    const glosses = consistentMeanings([firstLine, ...others], language);
    return {
      correct: glosses.texts[0]!,
      options: [...glosses.texts].sort(() => Math.random() - 0.5),
      lang: glosses.lang,
      missing: glosses.missing,
    };
  }, [firstLine, language]);

  if (!firstLine) return null;

  return (
    <div className="card stack">
      <strong>{t('comprehension')}</strong>
      <p>
        <Trans
          t={t}
          i18nKey="question"
          values={{ line: firstLine.ar }}
          components={{ 1: <span className="arabic-inline" /> }}
        />
      </p>
      {missing && <NotTranslated />}
      {options.map((opt) => (
        <button
          key={opt}
          lang={lang}
          className={`btn ${answer ? (opt === correct ? 'btn-accent' : '') : ''}`}
          onClick={() => {
            setAnswer(opt);
            if (opt === correct) onCorrect();
          }}
        >
          {opt}
        </button>
      ))}
      {answer && (
        <span className={answer === correct ? 'feedback-good' : 'feedback-bad'}>
          {answer === correct ? t('correct') : t('wrong', { answer: correct })}
        </span>
      )}
    </div>
  );
}
