/**
 * Content loader: merges `meta.json` and all `units/einheit-*.json`.
 *
 * New units are added simply by dropping in another `units/einheit-NN.json` –
 * `import.meta.glob` registers them automatically, without code changes.
 * (See ADR-0003.)
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
import metaRaw from './meta.json';

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

const units: UnitFile[] = Object.values(unitModules).sort(
  (a, b) => a.einheit - b.einheit
);

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
