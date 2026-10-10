/**
 * Content loader: merges `meta.json` and all `units/einheit-*.json`.
 *
 * New units are added simply by dropping in another `units/einheit-NN.json` –
 * `import.meta.glob` registers them automatically, without code changes.
 * (See ADR-0003.)
 *
 * The bundled unit files are the offline baseline: a published content bundle kept on the
 * device (story 16.2, `./bundle.ts`) replaces them unit by unit at start-up.
 */
import type {
  ContentBundle,
  ContentMeta,
  Dialog,
  GrammatikPunkt,
  Minimalpaar,
  NisbaEintrag,
  Quelle,
  Verb,
  Vokabel,
} from '@/types';
import { mergeUnits, readStoredBundle, retiredVocabulary } from './bundle';
import metaRaw from './meta.json';
import madinahBook1Lessons from './courses/madinah/book1-lessons.json';

interface UnitFile {
  einheit: number;
  titel: string;
  /** "entwurf": own draft content, not yet reviewed by the teacher. */
  status?: 'entwurf' | 'geprueft';
  kulturnotiz?: string;
  vokabeln: Vokabel[];
  dialoge: Dialog[];
  grammatik?: GrammatikPunkt[];
}

interface MetaFile {
  meta: ContentMeta;
  quellen: Quelle[];
  nisba: NisbaEintrag[];
  verben: Verb[];
  phonologie_minimalpaare: Minimalpaar[];
}

export interface UnitInfo {
  einheit: number;
  titel: string;
  status?: 'entwurf' | 'geprueft';
  kulturnotiz?: string;
}

const metaTyped = metaRaw as MetaFile;

// Eager glob: all unit files are bundled at build time (available offline).
const unitModules = import.meta.glob<UnitFile>('./units/*.json', {
  eager: true,
  import: 'default',
});

const builtInUnits: UnitFile[] = Object.values(unitModules).sort(
  (a, b) => a.einheit - b.einheit
);

const storedBundle = readStoredBundle();
const units: UnitFile[] = mergeUnits(builtInUnits, storedBundle);

/** Version of the published bundle in use; 0 means the units this app was built with. */
export const CONTENT_BUNDLE_VERSION = storedBundle?.version ?? 0;

/**
 * Words removed from the course after being published (tombstones). Never offered as new
 * cards, but SRS cards created earlier still show them.
 */
export const retiredVokabeln: Vokabel[] = retiredVocabulary(storedBundle);

const vokabeln: Vokabel[] = units.flatMap((u) => u.vokabeln);
const dialoge: Dialog[] = units.flatMap((u) => u.dialoge);

export const content: ContentBundle = {
  meta: metaTyped.meta,
  quellen: metaTyped.quellen,
  nisba: metaTyped.nisba,
  verben: metaTyped.verben,
  phonologie_minimalpaare: metaTyped.phonologie_minimalpaare,
  vokabeln,
  dialoge,
  grammatik: units.flatMap((u) => u.grammatik ?? []),
};

export const unitInfos: UnitInfo[] = units.map((u) => ({
  einheit: u.einheit,
  titel: u.titel,
  status: u.status,
  kulturnotiz: u.kulturnotiz,
}));

/** Fast lookup of a vocabulary word by ID. */
export const vokabelById = new Map(vokabeln.map((v) => [v.id, v]));

/** Root families: root → all linked content (vocabulary + verbs). */
export interface WurzelFamilie {
  wurzel: string;
  vokabeln: Vokabel[];
  verben: Verb[];
}

export const wurzelFamilien: Map<string, WurzelFamilie> = (() => {
  const map = new Map<string, WurzelFamilie>();
  const ensure = (w: string): WurzelFamilie => {
    let entry = map.get(w);
    if (!entry) {
      entry = { wurzel: w, vokabeln: [], verben: [] };
      map.set(w, entry);
    }
    return entry;
  };
  // Pronouns and particles carry an empty root and form no family.
  for (const v of vokabeln) if (v.wurzel) ensure(v.wurzel).vokabeln.push(v);
  for (const verb of content.verben) ensure(verb.wurzel).verben.push(verb);
  return map;
})();

export const CONTENT_VERSION = content.meta.contentVersion;

/**
 * Words of the Medina lessons (ADR-0025, stage 2) as vocabulary: our own German meanings of the
 * words a lesson introduces. They become review cards once practised in their lesson, so they
 * live apart from `content.vokabeln` (the bayna yadayk units).
 */
export const madinahVokabeln: Vokabel[] = (
  madinahBook1Lessons.lessons as {
    unit: number;
    words: { id: string; ar: string; de: string }[];
  }[]
).flatMap((lesson) =>
  lesson.words.map((w) => ({
    id: w.id,
    ar: w.ar,
    de: w.de,
    tr: '',
    wurzel: '',
    einheit: lesson.unit,
  }))
);
