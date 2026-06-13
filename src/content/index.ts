/**
 * Content-Loader: führt `meta.json` und alle `units/einheit-*.json` zusammen.
 *
 * Neue Einheiten kommen allein durch Ablegen einer weiteren `units/einheit-NN.json`
 * dazu – `import.meta.glob` registriert sie automatisch, ohne Code-Änderung.
 * (Siehe ADR-0003.)
 */
import type {
  ContentBundle,
  ContentMeta,
  Dialog,
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
  kulturnotiz?: string;
  vokabeln: Vokabel[];
  dialoge: Dialog[];
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
  kulturnotiz?: string;
}

const metaTyped = metaRaw as MetaFile;

// Eager glob: alle Unit-Dateien werden zur Build-Zeit eingebunden (offline verfügbar).
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
};

export const unitInfos: UnitInfo[] = units.map((u) => ({
  einheit: u.einheit,
  titel: u.titel,
  kulturnotiz: u.kulturnotiz,
}));

/** Schneller Lookup einer Vokabel nach ID. */
export const vokabelById = new Map(vokabeln.map((v) => [v.id, v]));

/** Wurzelfamilien: Wurzel → alle vernetzten Inhalte (Vokabeln + Verben). */
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
  for (const v of vokabeln) ensure(v.wurzel).vokabeln.push(v);
  for (const verb of content.verben) ensure(verb.wurzel).verben.push(verb);
  return map;
})();

export const CONTENT_VERSION = content.meta.contentVersion;
