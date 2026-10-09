import { describe, expect, it } from 'vitest';
import { G2pError, g2p, toIpa } from '../src/index.js';

const connected = (text: string) => toIpa(text, { pause: false });

describe('consonants and short vowels', () => {
  it('reads every letter with its vowel', () => {
    expect(connected('كَتَبَ')).toBe('kataba');
    expect(connected('ذَهَبَ')).toBe('ðahaba');
    expect(connected('شُغِلَ')).toBe('ʃuɣila');
    expect(connected('صَبَرَ ضَرَبَ طَلَبَ ظَهَرَ')).toBe(
      'sˤabara dˤaraba tˤalaba ðˤahara'
    );
    expect(connected('عَرَفَ حَمَلَ خَرَجَ')).toBe('ʕarafa ħamala xaradʒa');
    expect(connected('ثَوْب')).toBe('θawb');
  });

  it('keeps a consonant without vowel when sukun is written or nothing follows', () => {
    expect(connected('بَيْت')).toBe('bajt');
    expect(connected('قُمْ')).toBe('qum');
  });

  it('doubles a consonant under shadda', () => {
    expect(connected('مُدَرِّسٌ')).toBe('mudarːisun');
    expect(connected('ذَكَّرَ')).toBe('ðakːara');
  });

  it('reads the glottal stop on every hamza seat', () => {
    expect(connected('سَأَلَ سُئِلَ مُؤْمِن شَيْء')).toBe('saʔala suʔila muʔmin ʃajʔ');
    expect(connected('آمَنَ')).toBe('ʔaːmana');
  });

  it('fills in an unwritten vowel at a word-initial hamza', () => {
    expect(connected('إسلام')).toBe('ʔislaːm');
    expect(connected('أخ')).toBe('ʔax');
  });
});

describe('long vowels', () => {
  it('lengthens a vowel with the matching letter', () => {
    expect(connected('كِتَابٌ')).toBe('kitaːbun');
    expect(connected('نُور')).toBe('nuːr');
    expect(connected('كَبِير')).toBe('kabiːr');
    expect(connected('عَلى')).toBe('ʕalaː');
    expect(connected('هٰذا')).toBe('haːðaː');
  });

  it('fills in the vowel the lengthening letter implies (texts leave it out)', () => {
    expect(connected('طالِبٌ')).toBe('tˤaːlibun');
    expect(connected('يوسُف')).toBe('juːsuf');
    expect(connected('جَديد')).toBe('dʒadiːd');
  });

  it('reads wāw and yāʾ before an alif as consonants', () => {
    expect(connected('رِيالاً')).toBe('rijaːlan');
    expect(connected('طُوال')).toBe('tˤuwaːl');
  });

  it('reads wāw and yāʾ after fatḥa as diphthongs, and with a vowel as consonants', () => {
    expect(connected('يَوْم')).toBe('jawm');
    expect(connected('وَلَدٌ')).toBe('waladun');
    expect(connected('أَيّام')).toBe('ʔajːaːm');
  });

  it('keeps the alif after the plural wāw and in مِائَة silent', () => {
    expect(connected('كَتَبُوا')).toBe('katabuː');
    expect(connected('مِائَة')).toBe('miʔat');
  });

  it('does not repeat a dagger alif after a written alif', () => {
    expect(connected('عَلىٰ')).toBe('ʕalaː');
    expect(connected('الرَّحْمٰن')).toBe('ʔarːaħmaːn');
    expect(connected('صَلاٰة')).toBe('sˤalaːt');
  });
});

describe('the article and sun letters', () => {
  it('keeps the lam before moon letters and assimilates it to sun letters', () => {
    expect(connected('الْقَمَرُ')).toBe('ʔalqamaru');
    expect(connected('الشَّمْسُ')).toBe('ʔaʃːamsu');
    // A missing shadda on the sun letter is still read doubled.
    expect(connected('الشَمْس')).toBe('ʔaʃːams');
  });

  it('handles the article after a prefix and li-', () => {
    expect(connected('وَالْكِتابُ')).toBe('walkitaːbu');
    expect(connected('بِالْقَلَمِ')).toBe('bilqalami');
    expect(connected('والقَلَم')).toBe('walqalam');
    expect(connected('لِلطّالِبِ')).toBe('litˤːaːlibi');
  });

  it('reads allāh and allaḏī with a doubled lam', () => {
    expect(connected('اللّٰهُ')).toBe('ʔalːaːhu');
    // Usually written without the dagger alif; the lam is still long.
    expect(connected('اللهُ')).toBe('ʔalːaːhu');
    expect(toIpa('إِنْ شاءَ اللهُ')).toBe('ʔin ʃaːʔa lːaːh');
    expect(connected('لِلّهِ وَاللهِ')).toBe('lilːaːhi walːaːhi');
    expect(connected('الَّذي')).toBe('ʔalːaðiː');
  });
});

describe('hamzat al-waṣl', () => {
  it('is spoken with a vowel at the start of a phrase', () => {
    expect(connected('اسْم')).toBe('ʔism');
    expect(connected('اُكْتُبْ')).toBe('ʔuktub');
    expect(connected('اِجْلِسْ')).toBe('ʔidʒlis');
    expect(connected('اب')).toBe('ʔib');
    expect(connected('اكْتُبْ')).toBe('ʔuktub');
  });

  it('is silent inside a phrase, joined to the word before', () => {
    expect(connected('بَيْتُ الطّالِبِ')).toBe('bajtu tˤːaːlibi');
    expect(connected('فِي الْبَيْتِ')).toBe('fiː lbajti');
  });

  it('adds a helper vowel after a consonant: -a for مِنْ before the article, else -i', () => {
    expect(connected('مِنْ الْبَيْتِ')).toBe('mina lbajti');
    expect(connected('مِنْ اسْمِكَ')).toBe('mini smika');
    expect(connected('هَلْ الْبَيْتُ')).toBe('hali lbajtu');
  });

  it('is spoken again after a pause', () => {
    expect(toIpa('نَعَمْ، اسْمي سارَةُ.')).toBe('naʕam ʔismiː saːrah');
  });
});

describe('tanwīn and pausal forms', () => {
  it('adds -n in connected speech', () => {
    expect(connected('كِتاباً')).toBe('kitaːban');
    expect(connected('شُكْراً')).toBe('ʃukran');
    expect(connected('بَيْتٍ')).toBe('bajtin');
    expect(connected('سَماءً')).toBe('samaːʔan');
    expect(connected('مُسْتَشْفىً')).toBe('mustaʃfan');
  });

  it('reads tanwīn al-fatḥ written on the consonant before the alif', () => {
    expect(connected('كِتابًا جَديدًا')).toBe('kitaːban dʒadiːdan');
    expect(toIpa('كِتابًا جَديدًا')).toBe('kitaːban dʒadiːdaː');
  });

  it('drops the final vowel and tanwīn at a pause, -an becomes -ā', () => {
    expect(toIpa('هٰذا بَيْتٌ')).toBe('haːðaː bajt');
    expect(toIpa('كِتاباً')).toBe('kitaːbaː');
    expect(toIpa('شُكْراً')).toBe('ʃukraː');
    expect(toIpa('سَماءً')).toBe('samaːʔaː');
    expect(toIpa('مُسْتَشْفىً')).toBe('mustaʃfaː');
    expect(toIpa('أَنا يوسُفُ. مَنْ أَنْتَ؟')).toBe('ʔanaː juːsuf man ʔant');
  });

  it('reads tāʾ marbūṭa as -t in connected speech and -h at a pause', () => {
    expect(connected('مَدْرَسَةٌ كَبيرَةٌ')).toBe('madrasatun kabiːratun');
    expect(toIpa('مَدْرَسَةٌ كَبيرَةٌ')).toBe('madrasatun kabiːrah');
    expect(connected('مَدْرَسَة')).toBe('madrasat');
    // The fatḥa before tāʾ marbūṭa is often left out.
    expect(toIpa('طالِبة')).toBe('tˤaːlibah');
  });

  it('keeps long vowels and doubled consonants at a pause', () => {
    expect(toIpa('فِي')).toBe('fiː');
    expect(toIpa('حَقٌّ')).toBe('ħaqː');
  });
});

describe('letter index', () => {
  it('points each sound at the letter it comes from', () => {
    const text = 'السَّلامُ عَلَيْكُمْ';
    const { phones, words } = g2p(text);
    const at = (ipa: string) => text[phones.find((p) => p.ipa === ipa)!.letter];
    expect(at('ʔ')).toBe('ا');
    expect(at('sː')).toBe('س');
    expect(at('aː')).toBe('ا');
    expect(at('ʕ')).toBe('ع');
    expect(at('j')).toBe('ي');
    expect(words.map((w) => w.text)).toEqual(['السَّلامُ', 'عَلَيْكُمْ']);
    expect(phones.find((p) => p.ipa === 'ʕ')!.word).toBe(1);
  });

  it('gives a long vowel the lengthening letter and a short vowel its consonant', () => {
    const text = 'كِتابٌ';
    const { phones } = g2p(text, { pause: false });
    expect(phones.map((p) => [p.ipa, text[p.letter]])).toEqual([
      ['k', 'ك'],
      ['i', 'ك'],
      ['t', 'ت'],
      ['aː', 'ا'],
      ['b', 'ب'],
      ['u', 'ب'],
      ['n', 'ب'],
    ]);
  });

  it('keeps the helper vowel with the word before', () => {
    const { phones } = g2p('مِنْ الْبَيْتِ', { pause: false });
    expect(phones[3]).toMatchObject({ ipa: 'a', word: 0, letter: 2 });
  });
});

describe('input', () => {
  it('ignores quotes, tatwīl and repeated spaces', () => {
    expect(connected('«كَـتَبَ»  وَ')).toBe('kataba wa');
    expect(g2p('').phones).toEqual([]);
    expect(toIpa(' .؟ ')).toBe('');
  });

  it('rejects other scripts and marks without a letter', () => {
    expect(() => g2p('kitab')).toThrow(G2pError);
    expect(() => g2p('َبَ')).toThrow(/Mark without a letter at index 0/);
    expect(() => g2p('ٰ')).toThrow(/Mark without a letter at index 0/);
    try {
      g2p('بَيْت 3');
    } catch (error) {
      expect((error as G2pError).index).toBe(6);
    }
  });
});
