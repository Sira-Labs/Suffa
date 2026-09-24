/**
 * Types for the static teaching content (versioned in the repo under src/content/).
 * This content is NOT synced – it is immutable per contentVersion and is only
 * referenced by syncable learning data via `id`/`ref`.
 */

export type Register = 'MSA/فصحى' | 'Golf-Dialekt';

export interface ContentMeta {
  lehrwerk: string;
  register: string;
  ui: string;
  contentVersion: number;
}

export type QuelleTyp = 'youtube_playlist' | 'youtube_video' | 'verlag_audio';

export interface Quelle {
  typ: QuelleTyp;
  titel: string;
  url: string;
  einheit?: number;
  dialog?: number;
}

export interface Vokabel {
  /** Stable domain ID, derived from root + lemma (for SRS references). */
  id: string;
  ar: string;
  tr: string;
  de: string;
  /** Root, e.g. "ك-ت-ب"; empty for pronouns and particles (no root cards for them). */
  wurzel: string;
  wazn?: string;
  /** For uncountable/abstract terms the plural can be null. */
  plural?: string | null;
  einheit: number;
  hinweis?: string;
}

export interface NisbaEintrag {
  id: string;
  land: string;
  m: string;
  f: string;
  pl: string;
  de: string;
}

export interface DialogZeile {
  sp: string;
  ar: string;
  de: string;
}

export interface Dialog {
  id: string;
  einheit: number;
  dialog: number;
  titel: string;
  zeilen: DialogZeile[];
}

/** Person keys for verb conjugation. */
export type MadiPerson =
  | 'ana'
  | 'nahnu'
  | 'anta'
  | 'anti'
  | 'antuma'
  | 'antum'
  | 'antunna'
  | 'huwa'
  | 'hiya'
  | 'huma_m'
  | 'huma_f'
  | 'hum'
  | 'hunna';

export type AmrPerson = 'm_sg' | 'f_sg' | 'dual' | 'm_pl' | 'f_pl';

export type ConjugationTable = Record<MadiPerson, string>;
export type ImperativeTable = Record<AmrPerson, string>;

export interface Verb {
  id: string;
  lemma: string;
  wurzel: string;
  de: string;
  wazn: string;
  hinweis?: string;
  /** Unit that introduces the verb (for the unit's conjugation station). */
  einheit?: number;
  madi: ConjugationTable;
  mudari: ConjugationTable;
  amr: ImperativeTable;
}

export interface Minimalpaar {
  id: string;
  a: string;
  b: string;
  kontrast: string;
  de: string;
}

/** One quiz question on a grammar point: the answer and three distractors. */
export interface GrammatikFrage {
  /** `${pointId}#${index}` */
  id: string;
  /** Prompt (German). */
  frage: string;
  /** Optional Arabic context with … for the gap. */
  ar: string | null;
  antwort: string;
  ablenker: string[];
}

/**
 * A grammar point of a unit, placed in one dialogue section. Own explanations written for
 * Suffa (general MSA grammar), not taken from the book.
 */
export interface GrammatikPunkt {
  id: string;
  einheit: number;
  /** Dialogue section (1-based) the point belongs to. */
  abschnitt: number;
  titel: string;
  /** The rule in one line. */
  regel: string;
  erklaerung: string[];
  beispiele: { ar: string; de: string }[];
  fragen: GrammatikFrage[];
}

export interface ContentBundle {
  meta: ContentMeta;
  quellen: Quelle[];
  vokabeln: Vokabel[];
  nisba: NisbaEintrag[];
  dialoge: Dialog[];
  verben: Verb[];
  phonologie_minimalpaare: Minimalpaar[];
  grammatik: GrammatikPunkt[];
}

/** Person labels for the UI (German + Arabic pronoun). */
export const PERSON_LABELS: Record<MadiPerson, { ar: string; de: string }> = {
  ana: { ar: 'أنا', de: 'ich' },
  nahnu: { ar: 'نَحْنُ', de: 'wir' },
  anta: { ar: 'أنتَ', de: 'du (m.)' },
  anti: { ar: 'أنتِ', de: 'du (f.)' },
  antuma: { ar: 'أنتُما', de: 'ihr beide' },
  antum: { ar: 'أنتُم', de: 'ihr (m.)' },
  antunna: { ar: 'أنتُنَّ', de: 'ihr (f.)' },
  huwa: { ar: 'هُوَ', de: 'er' },
  hiya: { ar: 'هِيَ', de: 'sie' },
  huma_m: { ar: 'هُما (م)', de: 'sie beide (m.)' },
  huma_f: { ar: 'هُما (ف)', de: 'sie beide (f.)' },
  hum: { ar: 'هُم', de: 'sie (m.)' },
  hunna: { ar: 'هُنَّ', de: 'sie (f.)' },
};

export const AMR_LABELS: Record<AmrPerson, { ar: string; de: string }> = {
  m_sg: { ar: 'أنتَ', de: 'du (m.)' },
  f_sg: { ar: 'أنتِ', de: 'du (f.)' },
  dual: { ar: 'أنتُما', de: 'ihr beide' },
  m_pl: { ar: 'أنتُم', de: 'ihr (m.)' },
  f_pl: { ar: 'أنتُنَّ', de: 'ihr (f.)' },
};
