#!/usr/bin/env node
/**
 * Finds example sentences for our vocabulary in the Tatoeba corpus (CC BY 2.0 FR).
 *
 *   # once: download the exports into a folder (not committed)
 *   #   https://downloads.tatoeba.org/exports/per_language/ara/ara_sentences_detailed.tsv.bz2
 *   #   https://downloads.tatoeba.org/exports/per_language/ara/ara-deu_links.tsv.bz2
 *   #   https://downloads.tatoeba.org/exports/per_language/ara/ara-eng_links.tsv.bz2
 *   #   https://downloads.tatoeba.org/exports/per_language/deu/deu_sentences.tsv.bz2
 *   #   https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2
 *   #   and bunzip2 them
 *   node tools/content/tatoeba-examples.mjs <export-dir> > candidates.json
 *
 * Output: for every vocabulary id the best candidate sentences (short, mostly known words,
 * no dialect markers, with a German or English translation). The candidates are reviewed,
 * vocalized and translated before they go into content/sources/examples.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const CONTENT = path.resolve('apps/web/src/content/units');

/** Tashkīl, tatweel and superscript alif; letter variants folded for matching. */
export function normalize(text) {
  return text
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function tokenize(text) {
  return normalize(text)
    .split(/[^ء-ي]+/)
    .filter(Boolean);
}

const PREFIXES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك'];
const SUFFIXES = [
  'هما',
  'كما',
  'هم',
  'هن',
  'كم',
  'كن',
  'نا',
  'ها',
  'ه',
  'ك',
  'ي',
  'ات',
  'ين',
  'ون',
  'ان',
];

/** Candidate stems of a token: the token itself, without clitic prefixes and suffixes. */
export function stems(token) {
  const out = new Set([token]);
  for (const p of PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 2)
      out.add(token.slice(p.length));
  }
  for (const s of [...out]) {
    for (const suf of SUFFIXES) {
      if (s.endsWith(suf) && s.length - suf.length >= 2) out.add(s.slice(0, -suf.length));
    }
  }
  // Taa marbuta before a suffix is written ت: غرفتي → غرفت → غرفه
  for (const s of [...out]) {
    if (s.endsWith('ت') && s.length >= 3) out.add(`${s.slice(0, -1)}ه`);
  }
  return out;
}

/** Normalized lemma of a vocabulary entry (article removed), or null for phrases. */
export function lemmaKey(ar) {
  const n = normalize(ar).trim();
  if (/\s/.test(n)) return null;
  return n.startsWith('ال') && n.length > 3 ? n.slice(2) : n;
}

/** Colloquial markers: sentences containing them are skipped (we teach MSA). */
const DIALECT = new Set(
  'شو ايش إيش مش مو عايز عاوز بدي بدك هيك هيدا هاد هادا دلوقتي ازاي إزاي كتير منيح ليش وين فين امبارح بكره شلون هسه اكو ماكو زي لسه لسا عشان علشان حاجه ده دي دول'
    .split(' ')
    .map(normalize)
);

async function readTsv(file, onRow) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) onRow(line.split('\t'));
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: tatoeba-examples.mjs <export-dir>');
    process.exit(2);
  }
  const vocab = fs
    .readdirSync(CONTENT)
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8')).vokabeln);
  const known = new Set(vocab.map((v) => lemmaKey(v.ar)).filter(Boolean));

  const arabic = new Map(); // id → { text, user }
  await readTsv(path.join(dir, 'ara_sentences_detailed.tsv'), ([id, , text, user]) =>
    arabic.set(id, { text, user: user === '\\N' ? null : user })
  );
  const links = new Map(); // ara id → { deu: [ids], eng: [ids] }
  const wanted = { deu: new Set(), eng: new Set() };
  for (const lang of ['deu', 'eng']) {
    await readTsv(path.join(dir, `ara-${lang}_links.tsv`), ([a, b]) => {
      if (!arabic.has(a)) return;
      const entry = links.get(a) ?? { deu: [], eng: [] };
      entry[lang].push(b);
      links.set(a, entry);
      wanted[lang].add(b);
    });
  }
  const translations = { deu: new Map(), eng: new Map() };
  for (const lang of ['deu', 'eng']) {
    await readTsv(path.join(dir, `${lang}_sentences.tsv`), ([id, , text]) => {
      if (wanted[lang].has(id)) translations[lang].set(id, text);
    });
  }

  // Sentence pool: 2–9 words, Arabic only, no dialect markers, with a translation.
  const pool = [];
  for (const [id, { text, user }] of arabic) {
    const tokens = tokenize(text);
    if (tokens.length < 2 || tokens.length > 9) continue;
    if (/[A-Za-z0-9٠-٩]/.test(text)) continue;
    if (tokens.some((t) => DIALECT.has(t))) continue;
    const l = links.get(id);
    const de = l?.deu.map((x) => translations.deu.get(x)).find(Boolean) ?? null;
    const en = l?.eng.map((x) => translations.eng.get(x)).find(Boolean) ?? null;
    if (!de && !en) continue;
    const stemSets = tokens.map(stems);
    const knownShare =
      stemSets.filter((set) => [...set].some((s) => known.has(s))).length / tokens.length;
    pool.push({ id, text, user, de, en, tokens, stemSets, knownShare });
  }

  const used = new Map();
  const result = {};
  for (const v of vocab) {
    const key = lemmaKey(v.ar);
    const phrase = key ? null : normalize(v.ar).replace(/^ال/, '');
    const matches = pool
      .filter((s) =>
        key ? s.stemSets.some((set) => set.has(key)) : normalize(s.text).includes(phrase)
      )
      .map((s) => ({
        ...s,
        score:
          s.knownShare * 2 +
          (s.de ? 0.6 : 0) -
          Math.abs(s.tokens.length - 5) * 0.12 -
          (used.get(s.id) ?? 0) * 0.8,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    for (const m of matches.slice(0, 2)) used.set(m.id, (used.get(m.id) ?? 0) + 1);
    result[v.id] = {
      word: v.ar,
      de: v.de,
      einheit: v.einheit,
      candidates: matches.map(({ id, text, user, de, en, knownShare }) => ({
        id: Number(id),
        ar: text,
        user,
        de,
        en,
        known: Math.round(knownShare * 100) / 100,
      })),
    };
  }
  const covered = Object.values(result).filter((r) => r.candidates.length > 0).length;
  console.error(
    `${pool.length} usable sentences · ${covered}/${vocab.length} words with candidates`
  );
  process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
