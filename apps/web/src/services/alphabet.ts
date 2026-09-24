/**
 * Alphabet course for absolute beginners: the 28 letters (plus ة and ء) in lessons of letters
 * that share a shape, and a lesson on the vowel signs. Pure data and helpers; progress is
 * stored as practice records of "unit 0" (see ALPHABET_UNIT).
 */

export interface Letter {
  id: string;
  /** The letter on its own (for vowel signs: the sign on ب). */
  char: string;
  /** German name with transliteration, e.g. "Bāʾ". */
  name: string;
  /** Arabic name, spoken by the speech synthesis. */
  nameAr: string;
  /** How it sounds, for German speakers. */
  sound: string;
  /** Connects to the next letter? (ا د ذ ر ز و ة ء do not.) */
  connects: boolean;
  /** Has the four positional forms (false for vowel signs and ء). */
  forms: boolean;
  example: { ar: string; de: string };
}

export interface AlphabetLesson {
  no: number;
  title: string;
  hint: string;
  letters: Letter[];
}

/** Alphabet progress is stored like unit practice, under this pseudo unit. */
export const ALPHABET_UNIT = 0;

const TATWEEL = 'ـ';

const L = (
  id: string,
  char: string,
  name: string,
  nameAr: string,
  sound: string,
  example: [string, string],
  connects = true,
  forms = true
): Letter => ({
  id,
  char,
  name,
  nameAr,
  sound,
  connects,
  forms,
  example: { ar: example[0], de: example[1] },
});

export const ALPHABET_LESSONS: readonly AlphabetLesson[] = [
  {
    no: 1,
    title: 'Alif, Bāʾ, Tāʾ, Ṯāʾ, Nūn, Yāʾ',
    hint: 'Gleiche Grundform, nur die Punkte unterscheiden sie.',
    letters: [
      L('alif', 'ا', 'Alif', 'أَلِف', 'langes a', ['بابٌ', 'Tür'], false),
      L('ba', 'ب', 'Bāʾ', 'باء', 'b', ['بَيْتٌ', 'Haus']),
      L('ta', 'ت', 'Tāʾ', 'تاء', 't', ['تَمْرٌ', 'Datteln']),
      L('tha', 'ث', 'Ṯāʾ', 'ثاء', 'th wie im englischen „think“', ['ثَوْبٌ', 'Gewand']),
      L('nun', 'ن', 'Nūn', 'نون', 'n', ['نورٌ', 'Licht']),
      L('ya', 'ي', 'Yāʾ', 'ياء', 'j, als Vokal langes i', ['يَدٌ', 'Hand']),
    ],
  },
  {
    no: 2,
    title: 'Ǧīm, Ḥāʾ, Ḫāʾ',
    hint: 'Ein Bogen, der Punkt entscheidet: unten, keiner, oben.',
    letters: [
      L('jim', 'ج', 'Ǧīm', 'جيم', 'dsch wie in „Dschungel“', ['جَمَلٌ', 'Kamel']),
      L('ha', 'ح', 'Ḥāʾ', 'حاء', 'gehauchtes h tief aus der Kehle', ['حَليبٌ', 'Milch']),
      L('kha', 'خ', 'Ḫāʾ', 'خاء', 'ch wie in „Bach“', ['خُبْزٌ', 'Brot']),
    ],
  },
  {
    no: 3,
    title: 'Dāl, Ḏāl, Rāʾ, Zāy, Wāw',
    hint: 'Diese Buchstaben verbinden sich nie mit dem nächsten.',
    letters: [
      L('dal', 'د', 'Dāl', 'دال', 'd', ['دَرْسٌ', 'Unterricht'], false),
      L(
        'dhal',
        'ذ',
        'Ḏāl',
        'ذال',
        'th wie im englischen „this“',
        ['ذَهَبٌ', 'Gold'],
        false
      ),
      L('ra', 'ر', 'Rāʾ', 'راء', 'gerolltes r', ['رَجُلٌ', 'Mann'], false),
      L(
        'zay',
        'ز',
        'Zāy',
        'زاي',
        'stimmhaftes s wie in „Sonne“',
        ['زَيْتٌ', 'Öl'],
        false
      ),
      L('waw', 'و', 'Wāw', 'واو', 'w, als Vokal langes u', ['وَلَدٌ', 'Junge'], false),
    ],
  },
  {
    no: 4,
    title: 'Sīn, Šīn, Ṣād, Ḍād',
    hint: 'Zähnchen oder Schlaufe – mit oder ohne Punkte.',
    letters: [
      L('sin', 'س', 'Sīn', 'سين', 'scharfes s wie in „Haus“', ['سَمَكٌ', 'Fisch']),
      L('shin', 'ش', 'Šīn', 'شين', 'sch', ['شَمْسٌ', 'Sonne']),
      L('sad', 'ص', 'Ṣād', 'صاد', 'dunkles, kräftiges s', ['صَديقٌ', 'Freund']),
      L('dad', 'ض', 'Ḍād', 'ضاد', 'dunkles, kräftiges d', ['ضَيْفٌ', 'Gast']),
    ],
  },
  {
    no: 5,
    title: 'Ṭāʾ, Ẓāʾ, ʿAin, Ġain',
    hint: 'Zwei dunkle Laute und zwei Kehllaute.',
    letters: [
      L('ta2', 'ط', 'Ṭāʾ', 'طاء', 'dunkles, kräftiges t', ['طالِبٌ', 'Student']),
      L('za', 'ظ', 'Ẓāʾ', 'ظاء', 'dunkles th wie in „this“', ['ظُهْرٌ', 'Mittag']),
      L('ain', 'ع', 'ʿAin', 'عين', 'gepresster Laut tief in der Kehle', [
        'عَيْنٌ',
        'Auge',
      ]),
      L('ghain', 'غ', 'Ġain', 'غين', 'Zäpfchen-r wie in „Rabe“', ['غُرْفَةٌ', 'Zimmer']),
    ],
  },
  {
    no: 6,
    title: 'Fāʾ, Qāf, Kāf, Lām',
    hint: 'Fāʾ hat einen Punkt, Qāf zwei; Lām ist hoch und rund.',
    letters: [
      L('fa', 'ف', 'Fāʾ', 'فاء', 'f', ['فيلٌ', 'Elefant']),
      L('qaf', 'ق', 'Qāf', 'قاف', 'tiefes k aus dem Rachen', ['قَلَمٌ', 'Stift']),
      L('kaf', 'ك', 'Kāf', 'كاف', 'k', ['كِتابٌ', 'Buch']),
      L('lam', 'ل', 'Lām', 'لام', 'l', ['لَيْلٌ', 'Nacht']),
    ],
  },
  {
    no: 7,
    title: 'Mīm, Hāʾ, Tāʾ marbūṭa, Hamza',
    hint: 'Die letzten Buchstaben und zwei besondere Zeichen.',
    letters: [
      L('mim', 'م', 'Mīm', 'ميم', 'm', ['ماءٌ', 'Wasser']),
      L('ha2', 'ه', 'Hāʾ', 'هاء', 'h wie in „Haus“', ['هِلالٌ', 'Mondsichel']),
      L(
        'tam',
        'ة',
        'Tāʾ marbūṭa',
        'تاء مَرْبوطَة',
        'am Wortende: a (vor Endungen t)',
        ['مَدْرَسَةٌ', 'Schule'],
        false,
        false
      ),
      L(
        'hamza',
        'ء',
        'Hamza',
        'هَمْزَة',
        'Knacklaut wie in „be-achten“',
        ['سَماءٌ', 'Himmel'],
        false,
        false
      ),
    ],
  },
  {
    no: 8,
    title: 'Vokalzeichen',
    hint: 'Kurze Vokale und Zeichen über und unter den Buchstaben.',
    letters: [
      L(
        'fatha',
        'بَ',
        'Fatḥa',
        'فَتْحَة',
        'kurzes a: ba',
        ['كَتَبَ', 'er schrieb'],
        true,
        false
      ),
      L(
        'kasra',
        'بِ',
        'Kasra',
        'كَسْرَة',
        'kurzes i: bi',
        ['بِنْتٌ', 'Mädchen'],
        true,
        false
      ),
      L(
        'damma',
        'بُ',
        'Ḍamma',
        'ضَمَّة',
        'kurzes u: bu',
        ['كُتُبٌ', 'Bücher'],
        true,
        false
      ),
      L(
        'sukun',
        'بْ',
        'Sukūn',
        'سُكون',
        'kein Vokal: b',
        ['كَلْبٌ', 'Hund'],
        true,
        false
      ),
      L(
        'shadda',
        'بّ',
        'Šadda',
        'شَدَّة',
        'Buchstabe doppelt: bb',
        ['حُبٌّ', 'Liebe'],
        true,
        false
      ),
      L(
        'tanwin',
        'بٌ',
        'Tanwīn',
        'تَنْوين',
        'n-Endung: bun, bin, ban',
        ['بَيْتٌ', 'ein Haus'],
        true,
        false
      ),
    ],
  },
];

export const ALL_LETTERS: readonly Letter[] = ALPHABET_LESSONS.flatMap((l) => l.letters);

export type LetterForm = 'isoliert' | 'Anfang' | 'Mitte' | 'Ende';

/** The positional forms, written with tatweel (ـ) so they show joined. */
export function letterForms(letter: Letter): { form: LetterForm; text: string }[] {
  if (!letter.forms) return [{ form: 'isoliert', text: letter.char }];
  const c = letter.char;
  return [
    { form: 'isoliert', text: c },
    // A non-connecting letter looks the same at the start and joins only from the right.
    { form: 'Anfang', text: letter.connects ? `${c}${TATWEEL}` : c },
    {
      form: 'Mitte',
      text: letter.connects ? `${TATWEEL}${c}${TATWEEL}` : `${TATWEEL}${c}`,
    },
    { form: 'Ende', text: `${TATWEEL}${c}` },
  ];
}

/** Quiz items of a lesson: recognise each letter (shape → name) and find it (name → shape). */
export function lessonItems(lesson: AlphabetLesson): string[] {
  return lesson.letters.flatMap((l) => [`see:${l.id}`, `find:${l.id}`]);
}

export function parseItem(item: string): { kind: 'see' | 'find'; letter: Letter } | null {
  const [kind, id] = item.split(':');
  const letter = ALL_LETTERS.find((l) => l.id === id);
  if (!letter || (kind !== 'see' && kind !== 'find')) return null;
  return { kind, letter };
}
