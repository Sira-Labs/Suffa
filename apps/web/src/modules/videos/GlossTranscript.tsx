/**
 * The transcript of a video lesson (story 12.3): lines follow the video (tap a time to jump),
 * and tapping an Arabic word shows its course meaning.
 */
import { useState } from 'react';
import { ArabicText } from '@/components';
import { activeCue, clock, type Cue } from '@/services/media/checkpoints';
import { glossFor } from '@/services/videos/gloss';

export function GlossTranscript({
  cues,
  time,
  onSeek,
}: {
  cues: readonly Cue[];
  time: number;
  onSeek: (sec: number) => void;
}) {
  const [picked, setPicked] = useState<{ word: string; gloss: string | null } | null>(
    null
  );
  const current = activeCue(cues, time);
  // activeCue gives the index of the line being spoken (or -1).
  if (cues.length === 0) return null;
  return (
    <section className="card stack" aria-label="Transkript">
      <strong>Transkript</strong>
      <span className="muted">Tippe ein Wort für seine Bedeutung.</span>
      {picked && (
        <div className="badge" role="status" style={{ alignSelf: 'flex-start' }}>
          <ArabicText>{picked.word}</ArabicText>
          {picked.gloss ? ` – ${picked.gloss}` : ' – nicht im Kurswortschatz'}
        </div>
      )}
      <ol className="gloss-transcript">
        {cues.map((cue, i) => (
          <li key={i} className={i === current ? 'gloss-current' : undefined}>
            <button
              type="button"
              className="btn gloss-time"
              onClick={() => onSeek(cue.start)}
            >
              {clock(cue.start)}
            </button>
            <span lang="ar" dir="rtl" className="arabic">
              {cue.text.split(/(\s+)/).map((token, j) =>
                /[؀-ۿ]/.test(token) ? (
                  <button
                    key={j}
                    type="button"
                    className="gloss-word"
                    onClick={() => {
                      const hit = glossFor(token);
                      setPicked({ word: token, gloss: hit ? hit.de : null });
                    }}
                  >
                    {token}
                  </button>
                ) : (
                  token
                )
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
