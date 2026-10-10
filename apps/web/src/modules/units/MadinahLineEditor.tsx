/**
 * Admins mark the lines of a Medina lesson (the book follows the recording, ADR-0025):
 *
 * 1. "Find lines" finds the text lines on the page image (lineDetection.ts) – a suggestion to
 *    correct: a box can be removed, a missing one drawn with the pointer.
 * 2. "Find pauses" finds the author's pauses in the recording (pauseDetection.ts).
 * 3. "Suggest times" gives each line of a page one stretch of speech within the page's time.
 * 4. "Tap along": while the recording plays, tapping a line takes the playing time as its
 *    start (moved back to the start of the stretch of speech it falls into).
 *
 * Only boxes and seconds are saved; a line without a time is not saved.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/services/logger';
import {
  saveLessonSync,
  type LessonSync,
  type PageStart,
  type SyncLine,
} from '@/services/courses/bookSync';
import { detectLinesInImage, type Box } from '@/services/courses/lineDetection';
import {
  decodeRecording,
  fitSegments,
  snapToSegment,
  speechSegments,
  type Segment,
} from '@/services/courses/pauseDetection';
import { boxStyle } from './MadinahLineOverlay';

const log = logger.child('units:line-editor');
const COURSE = 'madinah';

export interface DraftLine {
  id: number;
  page: number;
  box: Box;
  start: number | null;
  /** The saved end, kept while the start stays as saved. */
  end?: number | null;
}

let nextId = 1;
const draftOf = (line: Omit<DraftLine, 'id'>): DraftLine => ({ ...line, id: nextId++ });

/** Seconds a last line lasts when nothing follows it and no pause tells. */
const LAST_LINE_SECONDS = 4;

/**
 * The saved lines from the timed drafts: in order of time, each ending where the next one
 * starts, the last one at the end of its stretch of speech.
 */
export function linesFromDrafts(
  drafts: readonly DraftLine[],
  segments: readonly Segment[]
): SyncLine[] {
  const timed = drafts
    .filter((d): d is DraftLine & { start: number } => d.start !== null)
    .sort((a, b) => a.start - b.start);
  return timed.map((d, i) => {
    const next = timed[i + 1];
    const own = segments.find((s) => s.start <= d.start && d.start < s.end);
    const end = next
      ? next.start
      : (d.end ?? own?.end ?? Math.round((d.start + LAST_LINE_SECONDS) * 100) / 100);
    return {
      page: d.page,
      box: d.box,
      start: d.start,
      end: Math.max(end, d.start + 0.1),
    };
  });
}

/**
 * One time per line of each page, from the stretches of speech within the page's time (from
 * its page turn to the next one; the whole recording when the page has no turn).
 */
export function suggestTimes(
  drafts: readonly DraftLine[],
  pageStarts: readonly PageStart[],
  segments: readonly Segment[]
): DraftLine[] {
  const byPage = new Map<number, DraftLine[]>();
  for (const d of drafts) byPage.set(d.page, [...(byPage.get(d.page) ?? []), d]);
  const out: DraftLine[] = [];
  for (const [page, lines] of byPage) {
    const i = pageStarts.findIndex((p) => p.page === page);
    const from = i >= 0 ? pageStarts[i]!.at : 0;
    const to = i >= 0 && pageStarts[i + 1] ? pageStarts[i + 1]!.at : Infinity;
    const within = segments.filter((s) => s.start >= from && s.start < to);
    const spans = fitSegments(within, lines.length);
    const ordered = [...lines].sort((a, b) => a.box[1] - b.box[1] || b.box[0] - a.box[0]);
    ordered.forEach((d, n) => {
      const span = spans[n];
      out.push(span ? { ...d, start: span.start, end: null } : d);
    });
  }
  return out;
}

/**
 * The admin's working copy of the lesson's lines, started from the saved ones once they have
 * arrived, and the editing state around it.
 */
export function useLineDraft(sync: LessonSync | null, loaded: boolean) {
  const [drafts, setDrafts] = useState<DraftLine[]>([]);
  const [mode, setMode] = useState<Mode>('select');
  const [selected, setSelected] = useState<number | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const seeded = useRef(false);
  useEffect(() => {
    if (!loaded || seeded.current) return;
    seeded.current = true;
    setDrafts(
      (sync?.lines ?? []).map((l) =>
        draftOf({ page: l.page, box: l.box, start: l.start, end: l.end })
      )
    );
  }, [loaded, sync]);
  /** A tap while the recording plays: the line starts at its stretch of speech. */
  const tap = (id: number, playing: number) =>
    setDrafts((all) =>
      all.map((d) =>
        d.id === id ? { ...d, start: snapToSegment(segments, playing), end: null } : d
      )
    );
  const draw = (page: number, box: Box) =>
    setDrafts((all) => [...all, draftOf({ page, box, start: null })]);
  return {
    drafts,
    setDrafts,
    mode,
    setMode,
    selected,
    setSelected,
    segments,
    setSegments,
    tap,
    draw,
  };
}

export type LineDraft = ReturnType<typeof useLineDraft>;

export type Mode = 'select' | 'tap' | 'draw';

/** The page with its draft lines: select, tap along or draw. */
export function EditOverlay({
  page,
  drafts,
  mode,
  selected,
  onSelect,
  onTap,
  onDraw,
}: {
  page: number;
  drafts: readonly DraftLine[];
  mode: Mode;
  selected: number | null;
  onSelect: (id: number) => void;
  onTap: (id: number) => void;
  onDraw: (box: Box) => void;
}) {
  const { t } = useTranslation('units');
  const area = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    x2: number;
    y2: number;
  } | null>(null);
  const at = (e: PointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const lines = drafts.filter((d) => d.page === page);
  const dragBox = (d: NonNullable<typeof drag>): Box => [
    Math.min(d.x, d.x2),
    Math.min(d.y, d.y2),
    Math.abs(d.x2 - d.x),
    Math.abs(d.y2 - d.y),
  ];

  return (
    <div
      ref={area}
      className={mode === 'draw' ? 'book-lines book-lines-draw' : 'book-lines'}
      role="group"
      aria-label={t('lessonPage.lines.editGroup')}
      onPointerDown={(e) => {
        if (mode !== 'draw') return;
        const p = at(e);
        setDrag({ x: p.x, y: p.y, x2: p.x, y2: p.y });
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag) setDrag({ ...drag, ...{ x2: at(e).x, y2: at(e).y } });
      }}
      onPointerUp={() => {
        if (!drag) return;
        const box = dragBox(drag);
        setDrag(null);
        // A click, not a drag, draws nothing.
        if (box[2] > 0.02 && box[3] > 0.01) onDraw(box);
      }}
    >
      {lines.map((d, i) => (
        <button
          key={d.id}
          type="button"
          className={[
            'book-line book-line-edit',
            d.start === null ? 'book-line-untimed' : '',
            selected === d.id ? 'book-line-selected' : '',
          ].join(' ')}
          style={boxStyle(d.box)}
          aria-pressed={mode === 'select' ? selected === d.id : undefined}
          aria-label={
            d.start === null
              ? t('lessonPage.lines.untimed', { n: i + 1 })
              : t('lessonPage.lines.timed', { n: i + 1, at: d.start.toFixed(1) })
          }
          onClick={() =>
            mode === 'tap' ? onTap(d.id) : mode === 'select' && onSelect(d.id)
          }
        />
      ))}
      {drag && <div className="book-line-drawing" style={boxStyle(dragBox(drag))} />}
    </div>
  );
}

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'error'; text: string };

/** The admin's tools under the page. */
export function LineTools({
  bookNo,
  lesson,
  page,
  audioUrl,
  imageUrl,
  playing,
  sync,
  draft,
  onSaved,
}: {
  bookNo: number;
  lesson: number;
  page: number;
  audioUrl: string;
  imageUrl: string;
  /** Seconds into the recording now. */
  playing: number;
  sync: LessonSync | null;
  draft: LineDraft;
  onSaved: (sync: LessonSync) => void;
}) {
  const {
    drafts,
    setDrafts,
    mode,
    setMode,
    selected,
    setSelected,
    segments,
    setSegments,
  } = draft;
  const { t } = useTranslation('units');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const onPage = drafts.filter((d) => d.page === page);
  const untimed = drafts.filter((d) => d.start === null).length;

  const findLines = async () => {
    setStatus({ kind: 'busy', text: t('lessonPage.lines.finding') });
    try {
      const boxes = await detectLinesInImage(imageUrl);
      setDrafts((all) => [
        ...all.filter((d) => d.page !== page),
        ...boxes.map((box) => draftOf({ page, box, start: null })),
      ]);
      setStatus({
        kind: 'done',
        text: t('lessonPage.lines.found', { count: boxes.length }),
      });
    } catch (error) {
      log.warn('line detection failed', { page, error: String(error) });
      setStatus({ kind: 'error', text: t('lessonPage.lines.findFailed') });
    }
  };

  const findPauses = async () => {
    setStatus({ kind: 'busy', text: t('lessonPage.lines.listening') });
    try {
      const { samples, sampleRate } = await decodeRecording(audioUrl);
      const found = speechSegments(samples, sampleRate);
      setSegments(found);
      setStatus({
        kind: 'done',
        text: t('lessonPage.lines.pauses', { count: found.length }),
      });
    } catch (error) {
      log.warn('pause detection failed', { lesson, error: String(error) });
      setStatus({ kind: 'error', text: t('lessonPage.lines.pausesFailed') });
    }
  };

  const save = async () => {
    const lines = linesFromDrafts(drafts, segments);
    setStatus({ kind: 'busy', text: t('lessonPage.sync.saving') });
    const pages = sync?.pages ?? [];
    const result = await saveLessonSync(COURSE, bookNo, lesson, {
      revision: sync?.revision ?? 0,
      pages,
      lines,
    });
    if (!result.ok) {
      const issues = result.issues?.length ? ` ${result.issues.join('; ')}` : '';
      setStatus({ kind: 'error', text: `${result.message}${issues}` });
      return;
    }
    onSaved({ lesson, revision: result.value.revision, pages, lines });
    setStatus({
      kind: 'done',
      text: t('lessonPage.sync.saved', { revision: result.value.revision }),
    });
  };

  const modeButton = (m: Mode, label: string) => (
    <button
      type="button"
      className="btn btn-small"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
    >
      {label}
    </button>
  );

  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        {t('lessonPage.lines.intro')}
      </p>
      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-small" onClick={() => void findLines()}>
          {t('lessonPage.lines.find')}
        </button>
        <button type="button" className="btn btn-small" onClick={() => void findPauses()}>
          {t('lessonPage.lines.findPauses')}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={segments.length === 0 || drafts.length === 0}
          onClick={() => {
            setDrafts((all) => suggestTimes(all, sync?.pages ?? [], segments));
            setStatus({ kind: 'done', text: t('lessonPage.lines.suggested') });
          }}
        >
          {t('lessonPage.lines.suggest')}
        </button>
      </div>
      <div
        className="row"
        role="group"
        aria-label={t('lessonPage.lines.modes')}
        style={{ gap: '0.5rem', flexWrap: 'wrap' }}
      >
        {modeButton('select', t('lessonPage.lines.select'))}
        {modeButton('tap', t('lessonPage.lines.tap'))}
        {modeButton('draw', t('lessonPage.lines.draw'))}
        <button
          type="button"
          className="btn btn-small"
          disabled={selected === null}
          onClick={() => {
            setDrafts((all) => all.filter((d) => d.id !== selected));
            setSelected(null);
          }}
        >
          {t('lessonPage.lines.remove')}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={onPage.length === 0}
          onClick={() => setDrafts((all) => all.filter((d) => d.page !== page))}
        >
          {t('lessonPage.lines.clearPage')}
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        {t('lessonPage.lines.count', { count: onPage.length })}
        {untimed > 0 && ` ${t('lessonPage.lines.untimedCount', { count: untimed })}`}
      </p>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={status.kind === 'busy'}
          onClick={() => void save()}
        >
          {t('lessonPage.lines.save')}
        </button>
        <span
          role="status"
          className={status.kind === 'error' ? 'feedback-bad' : 'muted'}
        >
          {status.kind === 'idle' ? '' : status.text}
        </span>
      </div>
      {mode === 'tap' && (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          {t('lessonPage.lines.tapHint', { at: playing.toFixed(1) })}
        </p>
      )}
    </div>
  );
}
