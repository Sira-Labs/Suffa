/**
 * Transcript under the player (story 8.1) in three views the learner picks: off, the line
 * being spoken (stays in view while watching) or the whole list with the current line marked
 * (a tap jumps there, "Mitlaufen" scrolls it along). For videos it also switches the
 * subtitles on the picture. Both choices are remembered on this device.
 */
import { useEffect, useRef, useState } from 'react';
import { activeCue, clock, type Cue } from '@/services/media/checkpoints';

export type TranscriptView = 'off' | 'line' | 'full';

const VIEWS: { key: TranscriptView; label: string }[] = [
  { key: 'off', label: 'Aus' },
  { key: 'line', label: 'Eine Zeile' },
  { key: 'full', label: 'Alles' },
];

export function TranscriptPanel({
  cues,
  time,
  onSeek,
  subtitles,
}: {
  cues: readonly Cue[];
  time: number;
  onSeek: (seconds: number) => void;
  /** Videos only: the subtitles on the picture and how to switch them. */
  subtitles?: { on: boolean; onChange: (on: boolean) => void };
}) {
  const current = activeCue(cues, time);
  const list = useRef<HTMLOListElement>(null);
  const [follow, setFollow] = useState(readFollow);
  const [view, setView] = useState<TranscriptView>(readView);

  useEffect(() => {
    const box = list.current;
    const el = box?.children[current] as HTMLElement | undefined;
    if (view !== 'full' || !follow || !box || !el) return;
    // Keep the current line in the upper third of the list.
    box.scrollTo?.({ top: el.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
  }, [current, follow, view]);

  if (cues.length === 0) return null;
  const choose = (next: TranscriptView) => {
    setView(next);
    save(VIEW_KEY, next);
  };

  return (
    <section className="card stack" aria-labelledby="transcript-title">
      <div className="collapsible-head" style={{ flexWrap: 'wrap' }}>
        <h2 id="transcript-title" className="eyebrow">
          Transkript
        </h2>
        <div className="segmented" role="group" aria-label="Transkript anzeigen">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`btn segmented-item${view === v.key ? ' btn-primary' : ''}`}
              aria-pressed={view === v.key}
              onClick={() => choose(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {subtitles && (
        <label className="row muted" style={{ gap: '0.4rem', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={subtitles.on}
            onChange={(e) => subtitles.onChange(e.target.checked)}
          />
          Untertitel im Video
        </label>
      )}
      {view === 'line' && (
        <p className="transcript-now" aria-live="polite">
          {current >= 0 ? (
            <>
              <span className="muted transcript-time">{clock(cues[current]!.start)}</span>
              <span lang="ar" dir="auto" className="arabic-inline">
                {cues[current]!.text}
              </span>
            </>
          ) : (
            <span className="muted">Startet mit dem Abspielen …</span>
          )}
        </p>
      )}
      {view === 'full' && (
        <>
          <label className="row muted" style={{ gap: '0.4rem', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => {
                setFollow(e.target.checked);
                save(FOLLOW_KEY, e.target.checked ? 'on' : 'off');
              }}
            />
            Text mitlaufen lassen
          </label>
          <ol className="transcript" ref={list}>
            {cues.map((cue, i) => (
              <li
                key={`${cue.start}-${i}`}
                className={i === current ? 'transcript-current' : ''}
              >
                <button className="transcript-line" onClick={() => onSeek(cue.start)}>
                  <span className="muted transcript-time">{clock(cue.start)}</span>
                  <span lang="ar" dir="rtl" className="arabic-inline">
                    {cue.text}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

const VIEW_KEY = 'suffa.transcript.view';

function readView(): TranscriptView {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === 'off' || saved === 'full' ? saved : 'line';
  } catch {
    return 'line';
  }
}

const FOLLOW_KEY = 'suffa.transcript.follow';

/** On unless the learner switched it off on this device. */
function readFollow(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== 'off';
  } catch {
    return true;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage blocked: the choice lasts for this visit only.
  }
}
