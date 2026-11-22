/**
 * Meanings in further languages (story 18.4, ADR-0031), inside "Inhalte prüfen": per unit and
 * language, the Arabic, the German and the LLM's draft side by side. A teacher approves a
 * draft as it is or with their own wording, or rejects it; an admin orders the drafts.
 * What is approved goes to learners with the next content bundle (ADR-0032), which an admin
 * can have made here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  countDrafts,
  MAX_MEANING_LENGTH,
  MEANING_DRAFT_LANGUAGES,
  MeaningsApi,
  type MeaningDecision,
  type MeaningDraftLanguage,
  type WordDraft,
  type WordWithDraft,
} from '@/services/content/meaningsApi';

export function MeaningReview({
  unitId,
  canDraft,
  api,
}: {
  unitId: string;
  /** Admins order drafts and publish approved meanings; teachers only review. */
  canDraft: boolean;
  api?: MeaningsApi;
}) {
  const { t } = useTranslation('content');
  const client = useMemo(() => api ?? new MeaningsApi(), [api]);
  const [language, setLanguage] = useState<MeaningDraftLanguage | ''>('');
  const [words, setWords] = useState<WordWithDraft[] | null>(null);
  const [message, setMessage] = useState<{ text: string; good?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // The newest request for the list. An answer to an older one (another language, another
  // unit) is dropped: its words must never appear under the language chosen now.
  const newest = useRef(0);
  const load = useCallback(
    async (chosen: MeaningDraftLanguage) => {
      const request = ++newest.current;
      const result = await client.list(unitId, chosen);
      if (request !== newest.current) return;
      if (!result.ok) {
        setWords(null);
        return setMessage({ text: result.message });
      }
      setWords(result.value.words);
    },
    [client, unitId]
  );

  useEffect(() => {
    newest.current += 1;
    setWords(null);
    setMessage(null);
    if (language) void load(language);
  }, [language, load]);

  // What the section shows now: the unit can change under it (browser history).
  const shown = (chosen: string) => `${unitId}:${chosen}`;
  const shownNow = useRef('');
  shownNow.current = shown(language);
  /** Runs a change and shows the list as it is afterwards; busy until that list is there. */
  const change = async (
    chosen: MeaningDraftLanguage,
    run: () => Promise<{ text: string; good?: boolean }>
  ) => {
    const asked = shown(chosen);
    setBusy(true);
    try {
      const outcome = await run();
      // Another language or unit meanwhile: this outcome is not about what is shown, and
      // loading the list again would put the old unit's words under the new one.
      if (asked !== shownNow.current) return;
      setMessage(outcome);
      // Also after a refusal: the row shown may be out of date (drafted again, German changed).
      await load(chosen);
    } finally {
      setBusy(false);
    }
  };

  const orderDrafts = (chosen: MeaningDraftLanguage) =>
    change(chosen, async () => {
      const result = await client.draft(unitId, chosen);
      return result.ok
        ? { text: t('meanings.drafted', { count: result.value.drafted }), good: true }
        : { text: result.message };
    });

  const publish = (chosen: MeaningDraftLanguage) =>
    change(chosen, async () => {
      const result = await client.publish();
      if (!result.ok) return { text: result.message };
      const { version } = result.value;
      return {
        text:
          version === null
            ? t('meanings.nothingToPublish')
            : t('meanings.published', { version }),
        good: true,
      };
    });

  const decide = async (draft: WordDraft, decision: MeaningDecision) => {
    if (!language) return;
    await change(language, async () => {
      const result = await client.review(draft.id, decision);
      return result.ok
        ? { text: t(`meanings.done.${decision.decision}`), good: true }
        : { text: result.message };
    });
  };

  const counts = words ? countDrafts(words) : null;
  return (
    <section className="card stack" aria-label={t('meanings.title')}>
      <h2 style={{ margin: 0 }}>{t('meanings.title')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('meanings.intro')}
      </p>
      <label className="row" style={{ flexWrap: 'wrap' }}>
        <span>{t('meanings.language')}</span>
        <select
          className="input"
          value={language}
          onChange={(e) => setLanguage(e.target.value as MeaningDraftLanguage | '')}
        >
          <option value="">{t('meanings.chooseLanguage')}</option>
          {MEANING_DRAFT_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`meanings.languages.${code}`)}
            </option>
          ))}
        </select>
      </label>
      {/* Always there, so that a screen reader hears the text when it changes. */}
      <span
        className={message?.good ? 'feedback-good' : 'feedback-bad'}
        role="status"
        hidden={!message}
      >
        {message?.text}
      </span>
      {language && counts && <p style={{ margin: 0 }}>{t('meanings.counts', counts)}</p>}
      {language && canDraft && counts && counts.missing + counts.rejected > 0 && (
        <button
          type="button"
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          disabled={busy}
          onClick={() => void orderDrafts(language)}
        >
          {t('meanings.order', { count: counts.missing + counts.rejected })}
        </button>
      )}
      {language && canDraft && counts && counts.approved > 0 && (
        <button
          type="button"
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          disabled={busy}
          onClick={() => void publish(language)}
        >
          {t('meanings.publish')}
        </button>
      )}
      {language && words && words.some((word) => word.draft) && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t('view.arabic')}</th>
                <th scope="col">{t('view.german')}</th>
                <th scope="col">{t(`meanings.languages.${language}`)}</th>
                <th scope="col">{t('meanings.state')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('meanings.decision')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {words.map(
                (word) =>
                  word.draft && (
                    <DraftRow
                      // A new draft of the same word starts from its own text.
                      key={`${word.draft.id}:${word.draft.text}`}
                      word={word}
                      draft={word.draft}
                      language={language}
                      busy={busy}
                      onDecide={decide}
                    />
                  )
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DraftRow({
  word,
  draft,
  language,
  busy,
  onDecide,
}: {
  word: WordWithDraft;
  draft: WordDraft;
  language: MeaningDraftLanguage;
  busy: boolean;
  onDecide: (draft: WordDraft, decision: MeaningDecision) => Promise<void>;
}) {
  const { t } = useTranslation('content');
  const [text, setText] = useState(draft.text);
  const wording = text.trim();
  // Approving the same text again would only write another decision.
  const approvedAsIs = draft.status === 'approved' && wording === draft.text;
  const label = t('meanings.wordingOf', { word: word.de });
  return (
    <tr>
      <td className="arabic-inline" lang="ar">
        {word.ar}
      </td>
      <th scope="row">{word.de}</th>
      <td>
        <input
          className="input"
          lang={language}
          aria-label={label}
          value={text}
          maxLength={MAX_MEANING_LENGTH}
          // The answer brings a new row: wording typed while it is on its way would be lost.
          disabled={busy || draft.stale || draft.own}
          onChange={(e) => setText(e.target.value)}
        />
      </td>
      <td>
        {draft.stale ? (
          <span className="badge feedback-warn">{t('meanings.stale')}</span>
        ) : (
          t(`meanings.status.${draft.status}`)
        )}
        {draft.own && <span className="muted"> · {t('meanings.own')}</span>}
      </td>
      <td>
        <span className="row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || draft.stale || draft.own || !wording || approvedAsIs}
            aria-label={t('meanings.approveOf', { word: word.de })}
            onClick={() =>
              void onDecide(draft, {
                decision: 'approved',
                seen: draft.text,
                ...(wording !== draft.text ? { text: wording } : {}),
              })
            }
          >
            {t('meanings.approve')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || draft.own || draft.status === 'rejected'}
            aria-label={t('meanings.rejectOf', { word: word.de })}
            onClick={() =>
              void onDecide(draft, { decision: 'rejected', seen: draft.text })
            }
          >
            {t('meanings.reject')}
          </button>
        </span>
      </td>
    </tr>
  );
}
