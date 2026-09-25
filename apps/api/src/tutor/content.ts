/**
 * The course content on the server (ADR-0011 grounding): the same JSON files the app bundles
 * (apps/web/src/content), read once at start. Gives the tutor a byte-stable curriculum pack
 * per unit (cacheable prompt prefix) and the lookups behind its tools.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Word {
  id: string;
  ar: string;
  tr: string;
  de: string;
  wurzel: string;
  wazn?: string;
  plural?: string | null;
  einheit: number;
  hinweis?: string;
}

export interface VerbEntry {
  id: string;
  lemma: string;
  wurzel: string;
  de: string;
  wazn: string;
  einheit?: number;
}

export interface GrammarPoint {
  id: string;
  einheit: number;
  titel: string;
  regel: string;
  beispiele: { ar: string; de: string }[];
}

export interface DialogueLine {
  sp: string;
  ar: string;
  de?: string;
}

export interface UnitContent {
  einheit: number;
  titel: string;
  vokabeln: Word[];
  dialoge: { titel: string; zeilen: DialogueLine[] }[];
  grammatik?: GrammarPoint[];
}

const TASHKIL = /[ً-ٰٟۖ-ۭ]/g;

/** Arabic without vowel marks and with folded letter variants, for matching. */
export function foldArabic(text: string): string {
  return text
    .replace(TASHKIL, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Latin text folded for matching (case, transliteration marks). */
function foldLatin(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʿʾ'’]/g, '')
    .trim();
}

/** "ك-ت-ب", "كتب" and "ك ت ب" all name the same root. */
export function foldRoot(root: string): string {
  return foldArabic(root).replace(/[-\s]/g, '');
}

export class ContentCatalog {
  private readonly byId = new Map<string, Word>();
  private readonly packs = new Map<number, string>();

  constructor(
    readonly units: UnitContent[],
    readonly verbs: VerbEntry[]
  ) {
    for (const unit of units) for (const w of unit.vokabeln) this.byId.set(w.id, w);
  }

  static async load(dir: string): Promise<ContentCatalog> {
    const unitDir = join(dir, 'units');
    const files = (await readdir(unitDir))
      .filter((f) => /^einheit-\d+\.json$/.test(f))
      .sort();
    const units = await Promise.all(
      files.map(
        async (f) => JSON.parse(await readFile(join(unitDir, f), 'utf8')) as UnitContent
      )
    );
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as {
      verben?: VerbEntry[];
    };
    units.sort((a, b) => a.einheit - b.einheit);
    return new ContentCatalog(units, meta.verben ?? []);
  }

  word(id: string): Word | undefined {
    return this.byId.get(id);
  }

  unit(n: number): UnitContent | undefined {
    return this.units.find((u) => u.einheit === n);
  }

  /** Words matching Arabic (vowels optional), transliteration or German; best matches first. */
  search(query: string, limit = 8): Word[] {
    const arabic = /[؀-ۿ]/.test(query);
    const q = arabic ? foldArabic(query) : foldLatin(query);
    if (!q) return [];
    const scored: { w: Word; score: number }[] = [];
    for (const w of this.byId.values()) {
      const fields = arabic
        ? [foldArabic(w.ar), foldArabic(w.plural ?? '')]
        : [foldLatin(w.tr), ...foldLatin(w.de).split(/[,;/]\s*/)];
      let score = 0;
      for (const f of fields) {
        if (!f) continue;
        if (f === q) score = Math.max(score, 3);
        else if (f.startsWith(q)) score = Math.max(score, 2);
        else if (f.includes(q)) score = Math.max(score, 1);
      }
      if (score > 0) scored.push({ w, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.w.einheit - b.w.einheit)
      .slice(0, limit)
      .map((s) => s.w);
  }

  /** Words and verbs sharing a root, in the order the course introduces them. */
  rootFamily(root: string): { words: Word[]; verbs: VerbEntry[] } {
    const r = foldRoot(root);
    if (!r) return { words: [], verbs: [] };
    return {
      words: [...this.byId.values()]
        .filter((w) => w.wurzel && foldRoot(w.wurzel) === r)
        .sort((a, b) => a.einheit - b.einheit),
      verbs: this.verbs.filter((v) => foldRoot(v.wurzel) === r),
    };
  }

  /**
   * The curriculum pack of one unit as prompt text: vocabulary, grammar rules and dialogue
   * lines. Built once and cached, so the bytes stay identical between calls (prompt cache).
   */
  pack(n: number): string {
    const cached = this.packs.get(n);
    if (cached !== undefined) return cached;
    const unit = this.unit(n);
    if (!unit) return '';
    const lines = [
      `# Einheit ${unit.einheit}: ${unit.titel}`,
      '## Wortschatz (ar | Umschrift | Deutsch | Wurzel | Plural)',
      ...unit.vokabeln.map((w) =>
        [w.ar, w.tr, w.de, w.wurzel || '–', w.plural ?? '–'].join(' | ')
      ),
    ];
    const verbs = this.verbs.filter((v) => v.einheit === n);
    if (verbs.length) {
      lines.push(
        '## Verben',
        ...verbs.map((v) => `${v.lemma} | ${v.de} | ${v.wurzel} | ${v.wazn}`)
      );
    }
    if (unit.grammatik?.length) {
      lines.push(
        '## Grammatik',
        ...unit.grammatik.map(
          (g) =>
            `- ${g.titel}: ${g.regel}${g.beispiele[0] ? ` (z. B. ${g.beispiele[0].ar} = ${g.beispiele[0].de})` : ''}`
        )
      );
    }
    if (unit.dialoge.length) {
      lines.push('## Dialoge');
      for (const d of unit.dialoge) {
        lines.push(
          `### ${d.titel}`,
          ...d.zeilen.map((z) => `${z.sp}: ${z.ar}${z.de ? ` — ${z.de}` : ''}`)
        );
      }
    }
    const text = lines.join('\n');
    this.packs.set(n, text);
    return text;
  }
}
