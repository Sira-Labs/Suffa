/**
 * Example sentences per vocabulary id (content/sources/examples.json), from Tatoeba
 * (CC BY 2.0 FR): vocalized and reviewed by Suffa; every sentence keeps its Tatoeba id and
 * author for attribution.
 */
export interface ExampleSentence {
  ar: string;
  de: string;
  /** Tatoeba sentence id of the Arabic original. */
  tatoeba: number;
  autor?: string;
  /** Who wrote the German translation. */
  deVon: 'tatoeba' | 'suffa';
}

export interface ExampleCatalog {
  source: {
    name: string;
    url: string;
    license: string;
    licenseUrl: string;
    changes: string;
    retrieved: string;
  };
  examples: Record<string, ExampleSentence[]>;
}
