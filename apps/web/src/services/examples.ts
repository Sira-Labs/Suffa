/**
 * Example sentences for vocabulary, loaded on demand (≈ 70 kB) the first time a card shows one.
 */
import type { ExampleCatalog } from '@/types';

let cached: Promise<ExampleCatalog> | null = null;

export function loadExamples(): Promise<ExampleCatalog> {
  cached ??= import('@/content/sources/examples.json').then(
    (module) => module.default as ExampleCatalog
  );
  return cached;
}

export function tatoebaUrl(id: number): string {
  return `https://tatoeba.org/de/sentences/show/${id}`;
}
