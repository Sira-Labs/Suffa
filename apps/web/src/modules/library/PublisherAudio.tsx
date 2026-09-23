import { useEffect, useMemo, useState } from 'react';
import type { AudioTrackKind, AudioUnit, PublisherAudioIndex } from '@/types';
import { logger } from '@/services/logger';

const log = logger.child('library:audio');

/** Learner-facing labels for the track kinds. */
export const KIND_LABELS: Record<AudioTrackKind, string> = {
  dialogue: 'Dialog',
  vocabulary: 'Vokabeln',
  'exercise-example': 'Übung – Beispiel',
  exercise: 'Übung',
  listening: 'Hörverstehen',
  sounds: 'Laute',
  exam: 'Test',
  other: 'Audio',
};

type Filter = 'all' | 'dialogue' | 'vocabulary' | 'listening' | 'practice';

const FILTERS: { id: Filter; label: string; kinds: AudioTrackKind[] | null }[] = [
  { id: 'all', label: 'Alle', kinds: null },
  { id: 'dialogue', label: 'Dialoge', kinds: ['dialogue'] },
  { id: 'vocabulary', label: 'Vokabeln', kinds: ['vocabulary'] },
  { id: 'listening', label: 'Hörverstehen', kinds: ['listening'] },
  {
    id: 'practice',
    label: 'Übungen & Laute',
    kinds: ['exercise-example', 'exercise', 'sounds', 'exam'],
  },
];

function unitLabel(unit: AudioUnit): string {
  if (unit.kind === 'unit') return `Einheit ${unit.unit}`;
  return /النهائي/.test(unit.title) ? 'Abschlusstest' : 'Zwischentest';
}

/**
 * The publisher's official audio for Book 1, by unit and lesson. The index is loaded on
 * demand (own chunk); the audio streams from the publisher's server and needs a connection.
 */
export function PublisherAudio({ initialUnit = 1 }: { initialUnit?: number }) {
  const [index, setIndex] = useState<PublisherAudioIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [unitNo, setUnitNo] = useState(initialUnit);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    import('@/content/sources/book1-audio.json')
      .then((module) => {
        if (!cancelled) setIndex(module.default as PublisherAudioIndex);
      })
      .catch((error: unknown) => {
        log.error('Publisher audio index could not be loaded', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unit = useMemo(
    () => index?.units.find((u) => u.unit === unitNo) ?? index?.units[0],
    [index, unitNo]
  );
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? null;

  if (failed)
    return <p className="muted">Die Audio-Übersicht konnte nicht geladen werden.</p>;
  if (!index || !unit) return <p className="muted">Lade Audio-Übersicht …</p>;

  return (
    <div className="stack">
      <div className="row" role="group" aria-label="Einheit wählen">
        {index.units.map((u) => (
          <button
            key={u.unit}
            className={`btn ${u.unit === unit.unit ? 'btn-accent' : ''}`}
            aria-pressed={u.unit === unit.unit}
            onClick={() => setUnitNo(u.unit)}
          >
            {u.kind === 'unit' ? u.unit : unitLabel(u)}
          </button>
        ))}
      </div>
      <div className="row" role="group" aria-label="Art der Aufnahme">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`btn ${f.id === filter ? 'btn-accent' : ''}`}
            aria-pressed={f.id === filter}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <h2 style={{ margin: 0 }}>{unitLabel(unit)}</h2>
      {unit.lessons.map((lesson) => {
        const tracks = lesson.tracks.filter((t) => !kinds || kinds.includes(t.kind));
        if (tracks.length === 0) return null;
        return (
          <section key={lesson.lesson} className="stack" aria-label={lesson.title}>
            <strong lang="ar" dir="rtl">
              {lesson.title}
            </strong>
            {tracks.map((track) => (
              <div key={track.url} className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span lang="ar" dir="rtl">
                    {track.title}
                  </span>
                  <span className="badge">{KIND_LABELS[track.kind]}</span>
                </div>
                <audio
                  controls
                  preload="none"
                  src={track.url}
                  style={{ width: '100%' }}
                  aria-label={`${KIND_LABELS[track.kind]}: ${track.title}`}
                />
              </div>
            ))}
          </section>
        );
      })}
      <p className="muted" style={{ fontSize: '0.85em' }}>
        Audio: © {index.source.publisher}, alle Rechte beim Verlag. Wird direkt vom
        Verlagsserver abgespielt und braucht eine Internetverbindung.
      </p>
    </div>
  );
}
