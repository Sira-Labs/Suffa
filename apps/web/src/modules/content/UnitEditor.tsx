/**
 * The editor of one course unit (story 16.1): title, culture note, words, dialogues and grammar
 * points. It edits a copy of the draft; the parent saves it against the revision it loaded.
 * Existing IDs are shown but not editable: SRS cards point at them (ADR-0003).
 */
import { useEffect, useId, useState } from 'react';
import type { Dialog, GrammatikFrage, GrammatikPunkt, Vokabel } from '@/types';
import type { UnitContent } from '@/services/content/contentApi';

interface Props {
  unit: number;
  content: UnitContent;
  /** IDs already saved for this unit (fixed); new rows get an editable ID. */
  savedIds: ReadonlySet<string>;
  onChange: (content: UnitContent) => void;
}

export function UnitEditor({ unit, content, savedIds, onChange }: Props) {
  const set = <K extends keyof UnitContent>(key: K, value: UnitContent[K]) =>
    onChange({ ...content, [key]: value });

  return (
    <div className="stack">
      <section className="card stack" aria-label="Allgemein">
        <TextField
          label="Titel"
          value={content.titel}
          onChange={(titel) => set('titel', titel)}
        />
        <TextArea
          label="Kulturnotiz"
          value={content.kulturnotiz ?? ''}
          onChange={(text) => set('kulturnotiz', text.trim() ? text : undefined)}
        />
      </section>
      <VocabSection
        unit={unit}
        items={content.vokabeln}
        savedIds={savedIds}
        onChange={(vokabeln) => set('vokabeln', vokabeln)}
      />
      <DialogSection
        unit={unit}
        items={content.dialoge}
        onChange={(dialoge) => set('dialoge', dialoge)}
      />
      <GrammarSection
        unit={unit}
        items={content.grammatik}
        sections={Math.max(1, content.dialoge.length)}
        onChange={(grammatik) => set('grammatik', grammatik)}
      />
    </div>
  );
}

function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((current, i) => (i === index ? item : current));
}

function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** The next free number for IDs like `d-3-<n>` or `g-3-<n>`. */
function nextNumber(ids: readonly string[], prefix: string): number {
  const numbers = ids
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter(Number.isInteger);
  return Math.max(0, ...numbers) + 1;
}

function VocabSection({
  unit,
  items,
  savedIds,
  onChange,
}: {
  unit: number;
  items: Vokabel[];
  savedIds: ReadonlySet<string>;
  onChange: (items: Vokabel[]) => void;
}) {
  const update = (index: number, patch: Partial<Vokabel>) =>
    onChange(replaceAt(items, index, { ...items[index]!, ...patch }));
  const optional = (value: string) => (value.trim() ? value : undefined);
  return (
    <section className="card stack" aria-label="Wörter">
      <h2 style={{ margin: 0 }}>Wörter ({items.length})</h2>
      {items.map((word, index) => (
        <fieldset key={index} className="cms-item">
          <legend className="muted">
            {savedIds.has(word.id) ? word.id : 'Neues Wort'}
          </legend>
          {!savedIds.has(word.id) && (
            <TextField
              label="Kennung (fest nach dem Speichern)"
              value={word.id}
              onChange={(id) => update(index, { id: id.trim() })}
            />
          )}
          <div className="cms-grid">
            <TextField
              label="Arabisch"
              arabic
              value={word.ar}
              onChange={(ar) => update(index, { ar })}
            />
            <TextField
              label="Umschrift"
              value={word.tr}
              onChange={(tr) => update(index, { tr })}
            />
            <TextField
              label="Deutsch"
              value={word.de}
              onChange={(de) => update(index, { de })}
            />
            <TextField
              label="Wurzel"
              arabic
              value={word.wurzel}
              onChange={(wurzel) => update(index, { wurzel })}
            />
            <TextField
              label="Plural"
              arabic
              value={word.plural ?? ''}
              onChange={(plural) =>
                update(index, { plural: plural.trim() ? plural : null })
              }
            />
            <TextField
              label="Wazn"
              arabic
              value={word.wazn ?? ''}
              onChange={(wazn) => update(index, { wazn: optional(wazn) })}
            />
          </div>
          <TextField
            label="Hinweis"
            value={word.hinweis ?? ''}
            onChange={(hinweis) => update(index, { hinweis: optional(hinweis) })}
          />
          <RemoveButton
            label={`Wort ${word.id || index + 1} entfernen`}
            onClick={() => onChange(removeAt(items, index))}
          />
        </fieldset>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange([
            ...items,
            { id: '', ar: '', tr: '', de: '', wurzel: '', plural: null, einheit: unit },
          ])
        }
      >
        Wort hinzufügen
      </button>
    </section>
  );
}

function DialogSection({
  unit,
  items,
  onChange,
}: {
  unit: number;
  items: Dialog[];
  onChange: (items: Dialog[]) => void;
}) {
  const update = (index: number, patch: Partial<Dialog>) =>
    onChange(replaceAt(items, index, { ...items[index]!, ...patch }));
  return (
    <section className="card stack" aria-label="Dialoge">
      <h2 style={{ margin: 0 }}>Dialoge ({items.length})</h2>
      {items.map((dialog, index) => (
        <fieldset key={dialog.id} className="cms-item">
          <legend className="muted">
            {dialog.id} · Abschnitt {dialog.dialog}
          </legend>
          <TextField
            label="Titel"
            arabic
            value={dialog.titel}
            onChange={(titel) => update(index, { titel })}
          />
          {dialog.zeilen.map((line, lineIndex) => (
            <div key={lineIndex} className="cms-grid cms-line">
              <TextField
                label={`Zeile ${lineIndex + 1}: Person`}
                arabic
                value={line.sp}
                onChange={(sp) =>
                  update(index, {
                    zeilen: replaceAt(dialog.zeilen, lineIndex, { ...line, sp }),
                  })
                }
              />
              <TextField
                label="Arabisch"
                arabic
                value={line.ar}
                onChange={(ar) =>
                  update(index, {
                    zeilen: replaceAt(dialog.zeilen, lineIndex, { ...line, ar }),
                  })
                }
              />
              <TextField
                label="Deutsch"
                value={line.de}
                onChange={(de) =>
                  update(index, {
                    zeilen: replaceAt(dialog.zeilen, lineIndex, { ...line, de }),
                  })
                }
              />
              <RemoveButton
                label={`Zeile ${lineIndex + 1} entfernen`}
                onClick={() =>
                  update(index, { zeilen: removeAt(dialog.zeilen, lineIndex) })
                }
              />
            </div>
          ))}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                update(index, { zeilen: [...dialog.zeilen, { sp: '', ar: '', de: '' }] })
              }
            >
              Zeile hinzufügen
            </button>
            <RemoveButton
              label={`Dialog ${dialog.id} entfernen`}
              onClick={() => onChange(removeAt(items, index))}
            />
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => {
          const n = nextNumber(
            items.map((d) => d.id),
            `d-${unit}-`
          );
          const section = Math.max(0, ...items.map((d) => d.dialog)) + 1;
          onChange([
            ...items,
            {
              id: `d-${unit}-${n}`,
              einheit: unit,
              dialog: section,
              titel: '',
              zeilen: [],
            },
          ]);
        }}
      >
        Dialog hinzufügen
      </button>
    </section>
  );
}

function GrammarSection({
  unit,
  items,
  sections,
  onChange,
}: {
  unit: number;
  items: GrammatikPunkt[];
  sections: number;
  onChange: (items: GrammatikPunkt[]) => void;
}) {
  const update = (index: number, patch: Partial<GrammatikPunkt>) =>
    onChange(replaceAt(items, index, { ...items[index]!, ...patch }));
  return (
    <section className="card stack" aria-label="Grammatik">
      <h2 style={{ margin: 0 }}>Grammatik ({items.length})</h2>
      {items.map((point, index) => (
        <fieldset key={point.id} className="cms-item">
          <legend className="muted">{point.id}</legend>
          <div className="cms-grid">
            <TextField
              label="Titel"
              value={point.titel}
              onChange={(titel) => update(index, { titel })}
            />
            <label className="stack cms-field">
              <span className="muted">Abschnitt</span>
              <select
                className="input"
                value={point.abschnitt}
                onChange={(e) => update(index, { abschnitt: Number(e.target.value) })}
              >
                {Array.from({ length: sections }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TextField
            label="Regel"
            value={point.regel}
            onChange={(regel) => update(index, { regel })}
          />
          <TextArea
            label="Erklärung (ein Absatz pro Zeile)"
            commitOnBlur
            value={point.erklaerung.join('\n')}
            onChange={(text) => update(index, { erklaerung: lines(text) })}
          />
          <TextArea
            label="Beispiele (pro Zeile: Arabisch | Deutsch)"
            commitOnBlur
            value={point.beispiele.map((b) => `${b.ar} | ${b.de}`).join('\n')}
            onChange={(text) =>
              update(index, {
                beispiele: lines(text).map((line) => {
                  const [ar = '', ...de] = line.split('|');
                  return { ar: ar.trim(), de: de.join('|').trim() };
                }),
              })
            }
          />
          <QuestionList point={point} onChange={(fragen) => update(index, { fragen })} />
          <RemoveButton
            label={`Grammatikpunkt ${point.id} entfernen`}
            onClick={() => onChange(removeAt(items, index))}
          />
        </fieldset>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => {
          const n = nextNumber(
            items.map((g) => g.id),
            `g-${unit}-`
          );
          onChange([
            ...items,
            {
              id: `g-${unit}-${n}`,
              einheit: unit,
              abschnitt: 1,
              titel: '',
              regel: '',
              erklaerung: [],
              beispiele: [],
              fragen: [],
            },
          ]);
        }}
      >
        Grammatikpunkt hinzufügen
      </button>
    </section>
  );
}

function QuestionList({
  point,
  onChange,
}: {
  point: GrammatikPunkt;
  onChange: (questions: GrammatikFrage[]) => void;
}) {
  const update = (index: number, patch: Partial<GrammatikFrage>) =>
    onChange(replaceAt(point.fragen, index, { ...point.fragen[index]!, ...patch }));
  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <strong>Quizfragen ({point.fragen.length})</strong>
      {point.fragen.map((question, index) => (
        <div key={question.id} className="cms-grid cms-line">
          <TextField
            label={`Frage ${index + 1}`}
            value={question.frage}
            onChange={(frage) => update(index, { frage })}
          />
          <TextField
            label="Arabischer Kontext (… für die Lücke)"
            arabic
            value={question.ar ?? ''}
            onChange={(ar) => update(index, { ar: ar.trim() ? ar : null })}
          />
          <TextField
            label="Antwort"
            arabic
            value={question.antwort}
            onChange={(antwort) => update(index, { antwort })}
          />
          <TextField
            label="Ablenker (mit Komma getrennt)"
            arabic
            commitOnBlur
            value={question.ablenker.join(', ')}
            onChange={(text) =>
              update(index, {
                ablenker: text
                  .split(/[,،]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <RemoveButton
            label={`Frage ${index + 1} entfernen`}
            onClick={() => onChange(removeAt(point.fragen, index))}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-small"
        onClick={() =>
          onChange([
            ...point.fragen,
            {
              // Questions count from 0: g-3-1#0, g-3-1#1, …
              id: `${point.id}#${
                point.fragen.length
                  ? nextNumber(
                      point.fragen.map((f) => f.id),
                      `${point.id}#`
                    )
                  : 0
              }`,
              frage: '',
              ar: null,
              antwort: '',
              ablenker: [],
            },
          ])
        }
      >
        Frage hinzufügen
      </button>
    </div>
  );
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * For fields whose text is parsed into a list (lines, comma-separated): typing goes to a local
   * copy and is handed on when the field loses focus, so a half-typed line or comma survives.
   */
  commitOnBlur?: boolean;
}

/** The text a field shows: the value, or the local copy while a commit-on-blur field is edited. */
function useFieldText({ value, onChange, commitOnBlur }: FieldProps) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);
  if (!commitOnBlur)
    return { text: value, change: onChange, focus: undefined, blur: undefined };
  return {
    text,
    change: setText,
    focus: () => setEditing(true),
    blur: () => {
      setEditing(false);
      if (text !== value) onChange(text);
    },
  };
}

function TextField(props: FieldProps & { arabic?: boolean }) {
  const { label, arabic = false } = props;
  const id = useId();
  const field = useFieldText(props);
  return (
    <div className="stack cms-field">
      <label htmlFor={id} className="muted">
        {label}
      </label>
      <input
        id={id}
        className={`input${arabic ? ' arabic-inline' : ''}`}
        dir={arabic ? 'rtl' : undefined}
        value={field.text}
        onChange={(e) => field.change(e.target.value)}
        onFocus={field.focus}
        onBlur={field.blur}
      />
    </div>
  );
}

function TextArea(props: FieldProps) {
  const id = useId();
  const field = useFieldText(props);
  return (
    <div className="stack cms-field">
      <label htmlFor={id} className="muted">
        {props.label}
      </label>
      <textarea
        id={id}
        className="input cms-textarea"
        rows={3}
        value={field.text}
        onChange={(e) => field.change(e.target.value)}
        onFocus={field.focus}
        onBlur={field.blur}
      />
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-small btn-danger"
      style={{ alignSelf: 'flex-start' }}
      aria-label={label}
      onClick={onClick}
    >
      Entfernen
    </button>
  );
}
