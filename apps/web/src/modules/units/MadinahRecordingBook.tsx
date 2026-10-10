/**
 * The author's recording of a Medina lesson with the book beside it: playing opens the book at
 * the lesson, and where an admin has set the page turns, the book turns its pages with the
 * recording. Flipping by hand while it plays lets the learner read on their own; "Book follows
 * the recording" brings it back. Book and recording stay at archive.org; only the times of the
 * page turns are ours (ADR-0023).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useRole } from '@/modules/account/useRole';
import {
  archivePdfUrl,
  bookPageImageUrl,
  bookPageUrl,
  lessonPages,
  type MadinahBook,
  type MadinahLesson,
} from '@/services/courses';
import {
  pageAt,
  saveLessonSync,
  useLessonSync,
  type LessonSync,
  type PageStart,
} from '@/services/courses/bookSync';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
const COURSE = 'madinah';

export function RecordingWithBook({
  book,
  lesson,
}: {
  book: MadinahBook;
  lesson: MadinahLesson;
}) {
  const { t } = useTranslation('units');
  const role = useRole();
  const pages = lessonPages(book, lesson);
  const { sync, loaded, replace } = useLessonSync(COURSE, book.book, lesson.lesson);
  const starts = sync?.pages ?? [];
  const audio = useRef<HTMLAudioElement>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [follow, setFollow] = useState(true);

  /** Shows the page the recording is on (only pages of this lesson). */
  const showPageAt = (seconds: number) => {
    const page = pageAt(starts, seconds);
    const i = page === null ? -1 : pages.indexOf(page);
    if (i >= 0) setIndex(i);
  };
  const onTime = () => {
    if (follow && audio.current) showPageAt(audio.current.currentTime);
  };
  const flip = (to: number) => {
    setIndex(to);
    // Reading ahead or back while it plays: the book stops following until asked again.
    if (audio.current && !audio.current.paused) setFollow(false);
  };
  const toggleFollow = () => {
    const next = !follow;
    setFollow(next);
    if (next && audio.current) showPageAt(audio.current.currentTime);
  };

  return (
    <>
      <section className="card stack" aria-label={t('lessonPage.recording')}>
        <strong>{t('lessonPage.recordingBy')}</strong>
        <audio
          ref={audio}
          controls
          preload="none"
          src={lesson.audio}
          aria-label={t('lessonPage.recordingLabel', { n: lesson.lesson })}
          style={{ width: '100%' }}
          onPlay={() => {
            setOpen(true);
            onTime();
          }}
          onTimeUpdate={onTime}
          onSeeked={onTime}
        />
        {starts.length > 0 && (
          <button
            type="button"
            className="btn btn-small"
            aria-pressed={follow}
            onClick={toggleFollow}
            style={{ alignSelf: 'flex-start' }}
          >
            {follow ? '✓ ' : ''}
            {t('lessonPage.followBook')}
          </button>
        )}
      </section>

      <BookPages
        pages={pages}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        index={index}
        onFlip={flip}
        image={(page, reduced) => bookPageImageUrl(book, page, reduced)}
        pdfUrl={(page) => archivePdfUrl(book, page)}
        mirrorUrl={(page) => bookPageUrl(book, page)}
        printed={lesson.goodword}
        printedUrl={book.sources.goodword}
      />

      {role === 'admin' && loaded && (
        <PageTurnEditor
          // Starts from the times saved for the lesson; a new lesson starts afresh.
          key={lesson.unit}
          bookNo={book.book}
          lesson={lesson.lesson}
          pages={pages}
          sync={sync}
          audio={audio}
          onSaved={replace}
        />
      )}
    </>
  );
}

/**
 * The lesson's pages of the book, one at a time, as page images from archive.org. Plain
 * images show on phones and computers alike; they load only when the book is opened. Where
 * the lesson is in the printed Goodword edition is given as a reference only.
 */
function BookPages({
  pages,
  open,
  onToggle,
  index,
  onFlip,
  image,
  pdfUrl,
  mirrorUrl,
  printed,
  printedUrl,
}: {
  pages: number[];
  open: boolean;
  onToggle: () => void;
  index: number;
  onFlip: (index: number) => void;
  image: (page: number, reduced: boolean) => string;
  pdfUrl: (page: number) => string;
  mirrorUrl: (page: number) => string;
  printed: { book: number; page: number };
  printedUrl: string;
}) {
  const { t } = useTranslation('units');
  // The page whose image archive.org could not deliver (the next page tries again).
  const [failed, setFailed] = useState<number | null>(null);
  const page = pages[index]!;
  const nextPage = pages[index + 1];

  // The next page loads in the background, so a page turn with the recording shows at once.
  useEffect(() => {
    if (!open || nextPage === undefined) return;
    const preload = new Image();
    preload.src = image(nextPage, true);
  }, [open, nextPage, image]);

  return (
    <section className="card stack" aria-label={t('lessonPage.inBook')}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong>
          {t('lessonPage.inBookPages', { from: pages[0], to: pages[pages.length - 1] })}
        </strong>
        <button
          type="button"
          className="btn btn-small btn-primary"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? t('lessonPage.closeBook') : t('lessonPage.showBook')}
        </button>
      </div>
      {open && (
        <figure
          className="stack"
          style={{ margin: '0 auto', gap: '0.5rem', width: '100%', maxWidth: '40rem' }}
        >
          {failed === page ? (
            <p role="alert" className="card muted" style={{ margin: 0 }}>
              {t('lessonPage.pageFailed', { page })}
            </p>
          ) : (
            <a href={image(page, false)} {...external} title={t('lessonPage.openPage')}>
              <img
                key={page}
                src={image(page, true)}
                alt={t('lessonPage.pageAlt', { page })}
                onError={() => setFailed(page)}
                style={{
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '1275 / 1651',
                  background: 'white',
                  borderRadius: '0.5rem',
                }}
              />
            </a>
          )}
          <figcaption className="row" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-small"
              disabled={index === 0}
              onClick={() => onFlip(index - 1)}
            >
              {t('lessonPage.previousPage')}
            </button>
            <span className="muted">
              {t('lessonPage.pageOf', { page, index: index + 1, total: pages.length })}
            </span>
            <button
              type="button"
              className="btn btn-small"
              disabled={index === pages.length - 1}
              onClick={() => onFlip(index + 1)}
            >
              {t('lessonPage.nextPage')}
            </button>
          </figcaption>
        </figure>
      )}
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        {t('lessonPage.asPdf')}{' '}
        <a href={pdfUrl(page)} {...external} translate="no">
          archive.org
        </a>{' '}
        ·{' '}
        <a href={mirrorUrl(page)} {...external} translate="no">
          AbdurRahman.org
        </a>
      </p>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        <Trans
          t={t}
          i18nKey="lessonPage.printed"
          values={{ book: printed.book, page: printed.page }}
          components={{ 1: <a href={printedUrl} {...external} /> }}
        />
      </p>
    </section>
  );
}

/** "1:05.3" for 65.3 seconds. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

/**
 * Admins tap along with the recording: "Now" takes the playing time as the start of a page.
 * Saving keeps the line marks the lesson already has.
 */
function PageTurnEditor({
  bookNo,
  lesson,
  pages,
  sync,
  audio,
  onSaved,
}: {
  bookNo: number;
  lesson: number;
  pages: number[];
  sync: LessonSync | null;
  audio: RefObject<HTMLAudioElement | null>;
  onSaved: (sync: LessonSync) => void;
}) {
  const { t } = useTranslation('units');
  const [times, setTimes] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const p of sync?.pages ?? []) initial[p.page] = String(p.at);
    if (initial[pages[0]!] === undefined) initial[pages[0]!] = '0';
    return initial;
  });
  const [status, setStatus] = useState<
    | { kind: 'idle' | 'saving' }
    | { kind: 'saved'; revision: number }
    | { kind: 'error'; text: string }
  >({ kind: 'idle' });

  const setTime = (page: number, value: string) => {
    setTimes((all) => ({ ...all, [page]: value }));
    setStatus({ kind: 'idle' });
  };

  const save = async () => {
    const starts: PageStart[] = [];
    for (const page of pages) {
      const raw = times[page]?.trim();
      if (!raw) continue;
      const at = Number(raw);
      if (!Number.isFinite(at) || at < 0) {
        setStatus({ kind: 'error', text: t('lessonPage.sync.invalid', { page }) });
        return;
      }
      starts.push({ page, at });
    }
    if (starts.some((s, i) => i > 0 && s.at <= starts[i - 1]!.at)) {
      setStatus({ kind: 'error', text: t('lessonPage.sync.order') });
      return;
    }
    setStatus({ kind: 'saving' });
    const lines = sync?.lines ?? [];
    const result = await saveLessonSync(COURSE, bookNo, lesson, {
      revision: sync?.revision ?? 0,
      pages: starts,
      lines,
    });
    if (!result.ok) {
      const issues = result.issues?.length ? ` ${result.issues.join('; ')}` : '';
      setStatus({ kind: 'error', text: `${result.message}${issues}` });
      return;
    }
    onSaved({ lesson, revision: result.value.revision, pages: starts, lines });
    setStatus({ kind: 'saved', revision: result.value.revision });
  };

  return (
    <section className="card stack" aria-labelledby={`page-turns-${lesson}`}>
      <h2 id={`page-turns-${lesson}`} style={{ margin: 0, fontSize: '1.05rem' }}>
        {t('lessonPage.sync.title')}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('lessonPage.sync.intro')}
      </p>
      {!sync?.pages.length && (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          {t('lessonPage.sync.none')}
        </p>
      )}
      <ul
        className="stack"
        style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0.4rem' }}
      >
        {pages.map((page) => {
          const value = times[page] ?? '';
          const seconds = Number(value);
          return (
            <li key={page} className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="row" style={{ gap: '0.5rem' }}>
                <span>{t('lessonPage.sync.startOf', { page })}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setTime(page, e.target.value)}
                  style={{ width: '6.5rem' }}
                />
              </label>
              {value !== '' && Number.isFinite(seconds) && (
                <span className="muted">{clock(seconds)}</span>
              )}
              <button
                type="button"
                className="btn btn-small"
                onClick={() =>
                  setTime(page, (audio.current?.currentTime ?? 0).toFixed(1))
                }
              >
                {t('lessonPage.sync.now')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={value === ''}
                onClick={() => setTime(page, '')}
              >
                {t('lessonPage.sync.clear')}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={status.kind === 'saving'}
          onClick={() => void save()}
        >
          {status.kind === 'saving'
            ? t('lessonPage.sync.saving')
            : t('lessonPage.sync.save')}
        </button>
        <span
          role="status"
          className={status.kind === 'error' ? 'feedback-bad' : 'muted'}
        >
          {status.kind === 'saved'
            ? t('lessonPage.sync.saved', { revision: status.revision })
            : status.kind === 'error'
              ? status.text
              : ''}
        </span>
      </div>
    </section>
  );
}
