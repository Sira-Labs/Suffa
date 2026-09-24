import { useEffect, useState } from 'react';
import type { ExampleCatalog } from '@/types';
import { loadExamples, tatoebaUrl } from '@/services/examples';
import { logger } from '@/services/logger';
import { isTtsSupported, speakArabic } from '@/services/speech';
import { ArabicText } from './ArabicText';

const log = logger.child('examples');

/**
 * One example sentence for a word, with its source (Tatoeba, CC BY 2.0 FR). Renders nothing
 * when the word has no example or the sentences cannot be loaded.
 */
export function WordExample({ vocabId }: { vocabId: string }) {
  const [catalog, setCatalog] = useState<ExampleCatalog | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadExamples()
      .then((c) => !cancelled && setCatalog(c))
      .catch((error: unknown) =>
        log.warn('Example sentences could not be loaded', {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const example = catalog?.examples[vocabId]?.[0];
  if (!catalog || !example) return null;
  const { source } = catalog;

  return (
    <figure className="word-example" aria-label="Beispielsatz">
      <ArabicText onClick={isTtsSupported() ? () => speakArabic(example.ar) : undefined}>
        {example.ar}
      </ArabicText>
      <span>{example.de}</span>
      {example.quelle === 'suffa' || !example.tatoeba ? (
        <figcaption className="muted">Eigener Beispielsatz (Suffa)</figcaption>
      ) : (
        <figcaption className="muted">
          Beispiel:{' '}
          <a href={tatoebaUrl(example.tatoeba)} target="_blank" rel="noreferrer">
            {source.name} #{example.tatoeba}
          </a>
          {example.autor ? ` von ${example.autor}` : ''} ·{' '}
          <a href={source.licenseUrl} target="_blank" rel="noreferrer">
            {source.license}
          </a>
          {example.deVon === 'suffa' ? ' · Übersetzung: Suffa' : ''}
        </figcaption>
      )}
    </figure>
  );
}
