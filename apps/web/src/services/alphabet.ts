/**
 * Alphabet course for absolute beginners: the 28 letters (plus ة and ء) in lessons of letters
 * that share a shape, and a lesson on the vowel signs. Pure data and helpers; progress is
 * stored as practice records of "unit 0" (see ALPHABET_UNIT). Lesson titles, hints and sounds
 * are interface texts in the `alphabet` catalogue (story 16.3); letter names stay as they are.
 */
import i18n from '@/i18n';

export interface Letter {
  id: string;
  /** The letter on its own (for vowel signs: the sign on ب). */
  char: string;
  /** German name with transliteration, e.g. "Bāʾ". */
  name: string;
  /** Arabic name, spoken by the speech synthesis. */
  nameAr: string;
  /** Connects to the next letter? (ا د ذ ر ز و ة ء do not.) */
  connects: boolean;
  /** Has the four positional forms (false for vowel signs and ء). */
  forms: boolean;
  example: { ar: string; de: string };
}

export interface AlphabetLesson {
  no: number;
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
  example: [string, string],
  connects = true,
  forms = true
): Letter => ({
  id,
  char,
  name,
  nameAr,
  connects,
  forms,
  example: { ar: example[0], de: example[1] },
});

export const ALPHABET_LESSONS: readonly AlphabetLesson[] = [
  {
    no: 1,
    letters: [
      L('alif', 'ا', 'Alif', 'أَلِف', ['بابٌ', 'Tür'], false),
      L('ba', 'ب', 'Bāʾ', 'باء', ['بَيْتٌ', 'Haus']),
      L('ta', 'ت', 'Tāʾ', 'تاء', ['تَمْرٌ', 'Datteln']),
      L('tha', 'ث', 'Ṯāʾ', 'ثاء', ['ثَوْبٌ', 'Gewand']),
      L('nun', 'ن', 'Nūn', 'نون', ['نورٌ', 'Licht']),
      L('ya', 'ي', 'Yāʾ', 'ياء', ['يَدٌ', 'Hand']),
    ],
  },
  {
    no: 2,
    letters: [
      L('jim', 'ج', 'Ǧīm', 'جيم', ['جَمَلٌ', 'Kamel']),
      L('ha', 'ح', 'Ḥāʾ', 'حاء', ['حَليبٌ', 'Milch']),
      L('kha', 'خ', 'Ḫāʾ', 'خاء', ['خُبْزٌ', 'Brot']),
    ],
  },
  {
    no: 3,
    letters: [
      L('dal', 'د', 'Dāl', 'دال', ['دَرْسٌ', 'Unterricht'], false),
      L('dhal', 'ذ', 'Ḏāl', 'ذال', ['ذَهَبٌ', 'Gold'], false),
      L('ra', 'ر', 'Rāʾ', 'راء', ['رَجُلٌ', 'Mann'], false),
      L('zay', 'ز', 'Zāy', 'زاي', ['زَيْتٌ', 'Öl'], false),
      L('waw', 'و', 'Wāw', 'واو', ['وَلَدٌ', 'Junge'], false),
    ],
  },
  {
    no: 4,
    letters: [
      L('sin', 'س', 'Sīn', 'سين', ['سَمَكٌ', 'Fisch']),
      L('shin', 'ش', 'Šīn', 'شين', ['شَمْسٌ', 'Sonne']),
      L('sad', 'ص', 'Ṣād', 'صاد', ['صَديقٌ', 'Freund']),
      L('dad', 'ض', 'Ḍād', 'ضاد', ['ضَيْفٌ', 'Gast']),
    ],
  },
  {
    no: 5,
    letters: [
      L('ta2', 'ط', 'Ṭāʾ', 'طاء', ['طالِبٌ', 'Student']),
      L('za', 'ظ', 'Ẓāʾ', 'ظاء', ['ظُهْرٌ', 'Mittag']),
      L('ain', 'ع', 'ʿAin', 'عين', ['عَيْنٌ', 'Auge']),
      L('ghain', 'غ', 'Ġain', 'غين', ['غُرْفَةٌ', 'Zimmer']),
    ],
  },
  {
    no: 6,
    letters: [
      L('fa', 'ف', 'Fāʾ', 'فاء', ['فيلٌ', 'Elefant']),
      L('qaf', 'ق', 'Qāf', 'قاف', ['قَلَمٌ', 'Stift']),
      L('kaf', 'ك', 'Kāf', 'كاف', ['كِتابٌ', 'Buch']),
      L('lam', 'ل', 'Lām', 'لام', ['لَيْلٌ', 'Nacht']),
    ],
  },
  {
    no: 7,
    letters: [
      L('mim', 'م', 'Mīm', 'ميم', ['ماءٌ', 'Wasser']),
      L('ha2', 'ه', 'Hāʾ', 'هاء', ['هِلالٌ', 'Mondsichel']),
      L(
        'tam',
        'ة',
        'Tāʾ marbūṭa',
        'تاء مَرْبوطَة',
        ['مَدْرَسَةٌ', 'Schule'],
        false,
        false
      ),
      L('hamza', 'ء', 'Hamza', 'هَمْزَة', ['سَماءٌ', 'Himmel'], false, false),
    ],
  },
  {
    no: 8,
    letters: [
      L('fatha', 'بَ', 'Fatḥa', 'فَتْحَة', ['كَتَبَ', 'er schrieb'], true, false),
      L('kasra', 'بِ', 'Kasra', 'كَسْرَة', ['بِنْتٌ', 'Mädchen'], true, false),
      L('damma', 'بُ', 'Ḍamma', 'ضَمَّة', ['كُتُبٌ', 'Bücher'], true, false),
      L('sukun', 'بْ', 'Sukūn', 'سُكون', ['كَلْبٌ', 'Hund'], true, false),
      L('shadda', 'بّ', 'Šadda', 'شَدَّة', ['حُبٌّ', 'Liebe'], true, false),
      L('tanwin', 'بٌ', 'Tanwīn', 'تَنْوين', ['بَيْتٌ', 'ein Haus'], true, false),
    ],
  },
];

/** A lesson's title in the interface language ("Vokalzeichen", "Vowel signs"). */
export function lessonTitle(lesson: Pick<AlphabetLesson, 'no'>): string {
  return text(`alphabet:course.lessons.${lesson.no}.title`);
}

/** What the letters of a lesson have in common. */
export function lessonHint(lesson: Pick<AlphabetLesson, 'no'>): string {
  return text(`alphabet:course.lessons.${lesson.no}.hint`);
}

/** How a letter sounds, for speakers of the interface language. */
export function letterSound(letter: Pick<Letter, 'id'>): string {
  return text(`alphabet:course.sounds.${letter.id}`);
}

/** Keys built from lesson numbers and letter ids are not known to the typed `t`. */
function text(key: string): string {
  return (i18n as unknown as { t(key: string): string }).t(key);
}

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
