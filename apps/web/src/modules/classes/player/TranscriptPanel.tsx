/** Transcript under the player (story 8.1): the current line is marked; a tap jumps there. */
import { useEffect, useRef } from 'react';
import { activeCue, clock, type Cue } from '@/services/media/checkpoints';

export function TranscriptPanel({
  cues,
  time,
  onSeek,
}: {
  cues: readonly Cue[];
  time: number;
  onSeek: (seconds: number) => void;
}) {
  const current = activeCue(cues, time);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current?.children[current] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [current]);

  if (cues.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="transcript-title">
      <h2 id="transcript-title" className="eyebrow">
        Transkript
      </h2>
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
    </section>
  );
}
