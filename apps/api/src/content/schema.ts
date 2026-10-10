/**
 * The shape of a course unit in the CMS (story 16.1). It mirrors the unit files of the web app
 * (`apps/web/src/content/units/einheit-NN.json`, types in `apps/web/src/types/content.ts`);
 * a test validates every seed file against it, so the two cannot drift apart silently.
 *
 * `validateUnitContent` adds the rules the schema alone cannot express: items carry the unit's
 * number, IDs are unique within the unit and quiz question IDs belong to their grammar point.
 */
import { z } from 'zod';

const short = z.string().trim().min(1).max(300);
const optionalShort = z.string().trim().max(300);
const long = z.string().trim().min(1).max(4000);
/** Content IDs end up in SRS cards (contentRef): plain ASCII, no spaces. */
const contentId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:#-]*$/, 'invalid id');

export const VocabSchema = z
  .object({
    id: contentId,
    ar: short,
    tr: short,
    de: short,
    // Empty for pronouns and particles (no root family).
    wurzel: optionalShort,
    wazn: short.optional(),
    plural: short.nullable().optional(),
    einheit: z.number().int(),
    hinweis: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const DialogSchema = z
  .object({
    id: contentId,
    einheit: z.number().int(),
    dialog: z.number().int().min(1).max(20),
    titel: short,
    zeilen: z
      .array(
        z.object({ sp: short, ar: z.string().trim().min(1).max(1000), de: long }).strict()
      )
      .min(1)
      .max(60),
  })
  .strict();

export const GrammarQuestionSchema = z
  .object({
    id: contentId,
    frage: z.string().trim().min(1).max(1000),
    ar: z.string().trim().min(1).max(1000).nullable(),
    antwort: short,
    ablenker: z.array(short).min(1).max(6),
  })
  .strict();

export const GrammarSchema = z
  .object({
    id: contentId,
    einheit: z.number().int(),
    abschnitt: z.number().int().min(1).max(20),
    titel: short,
    regel: z.string().trim().min(1).max(1000),
    erklaerung: z.array(long).min(1).max(20),
    beispiele: z
      .array(z.object({ ar: z.string().trim().min(1).max(1000), de: long }).strict())
      .max(20),
    fragen: z.array(GrammarQuestionSchema).max(20),
  })
  .strict();

/** A unit's editable content (the draft). Number and review status live beside it. */
export const UnitContentSchema = z
  .object({
    titel: short,
    kulturnotiz: z.string().trim().min(1).max(4000).optional(),
    vokabeln: z.array(VocabSchema).max(300),
    dialoge: z.array(DialogSchema).max(20),
    grammatik: z.array(GrammarSchema).max(40),
  })
  .strict();

export type UnitContent = z.infer<typeof UnitContentSchema>;
export type Vocab = z.infer<typeof VocabSchema>;

/** A unit file as the app reads it (seed files and published units). */
export const UnitFileSchema = UnitContentSchema.extend({
  einheit: z.number().int().min(1).max(999),
  status: z.enum(['entwurf', 'geprueft']).optional(),
}).strict();

export type UnitFile = z.infer<typeof UnitFileSchema>;

export type ContentIdKind = 'vocab' | 'dialog' | 'grammar' | 'question';

/** Every content ID of a unit with its kind, in document order. */
export function contentIds(content: UnitContent): { id: string; kind: ContentIdKind }[] {
  return [
    ...content.vokabeln.map((v) => ({ id: v.id, kind: 'vocab' as const })),
    ...content.dialoge.map((d) => ({ id: d.id, kind: 'dialog' as const })),
    ...content.grammatik.flatMap((g) => [
      { id: g.id, kind: 'grammar' as const },
      ...g.fragen.map((f) => ({ id: f.id, kind: 'question' as const })),
    ]),
  ];
}

export type ValidationResult =
  | { ok: true; content: UnitContent }
  | { ok: false; issues: string[] };

/** Schema plus the cross-field rules; issues are short English paths for the editor. */
export function validateUnitContent(unit: number, input: unknown): ValidationResult {
  const parsed = UnitContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const content = parsed.data;
  const issues: string[] = [];

  const items: { path: string; einheit: number }[] = [
    ...content.vokabeln.map((v, i) => ({ path: `vokabeln.${i}`, einheit: v.einheit })),
    ...content.dialoge.map((d, i) => ({ path: `dialoge.${i}`, einheit: d.einheit })),
    ...content.grammatik.map((g, i) => ({ path: `grammatik.${i}`, einheit: g.einheit })),
  ];
  for (const item of items) {
    if (item.einheit !== unit) issues.push(`${item.path}.einheit: must be ${unit}`);
  }

  const seen = new Set<string>();
  for (const { id } of contentIds(content)) {
    if (seen.has(id)) issues.push(`duplicate id ${id}`);
    seen.add(id);
  }

  const dialogNumbers = new Set<number>();
  content.dialoge.forEach((d, i) => {
    if (dialogNumbers.has(d.dialog))
      issues.push(`dialoge.${i}.dialog: ${d.dialog} twice`);
    dialogNumbers.add(d.dialog);
  });

  content.grammatik.forEach((g, i) => {
    // A grammar point sits in one dialogue section of the unit.
    if (content.dialoge.length > 0 && g.abschnitt > content.dialoge.length) {
      issues.push(
        `grammatik.${i}.abschnitt: unit has ${content.dialoge.length} dialogues`
      );
    }
    g.fragen.forEach((f, j) => {
      if (!f.id.startsWith(`${g.id}#`)) {
        issues.push(`grammatik.${i}.fragen.${j}.id: must start with ${g.id}#`);
      }
      if (f.ablenker.includes(f.antwort)) {
        issues.push(`grammatik.${i}.fragen.${j}.ablenker: contains the answer`);
      }
    });
  });

  return issues.length
    ? { ok: false, issues: issues.slice(0, 20) }
    : { ok: true, content };
}

export interface ItemChanges {
  added: string[];
  removed: string[];
  changed: string[];
  /** Title or culture note changed. */
  textChanged: boolean;
}

/**
 * What a draft changes against the published unit, item by item (vocabulary, dialogues,
 * grammar points; a changed quiz question counts as a change of its grammar point).
 */
export function diffUnits(before: UnitContent | null, after: UnitContent): ItemChanges {
  const index = (content: UnitContent | null) =>
    new Map<string, string>(
      content
        ? [
            ...content.vokabeln.map((v) => [v.id, stable(v)] as const),
            ...content.dialoge.map((d) => [d.id, stable(d)] as const),
            ...content.grammatik.map((g) => [g.id, stable(g)] as const),
          ]
        : []
    );
  const old = index(before);
  const next = index(after);
  const added = [...next.keys()].filter((id) => !old.has(id));
  const removed = [...old.keys()].filter((id) => !next.has(id));
  const changed = [...next.keys()].filter(
    (id) => old.has(id) && old.get(id) !== next.get(id)
  );
  const textChanged =
    before === null ||
    before.titel !== after.titel ||
    (before.kulturnotiz ?? '') !== (after.kulturnotiz ?? '');
  return { added, removed, changed, textChanged };
}

/** JSON with sorted keys, so key order never counts as a change. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      : v
  );
}

/** The editable part of a unit file. */
export function contentOfFile(file: UnitFile): UnitContent {
  const { einheit: _einheit, status: _status, ...content } = file;
  return content;
}
