import type { Messages } from '../../types';
import type { sources as de } from '../de/sources';

export const sources: Messages<typeof de> = {
  title: 'Sources & licences',
  intro:
    'Suffa is free. What we write ourselves is listed here as “our own content”. We show books, recordings and videos by others at their source or link to them; we do not copy them.',
  madinah: {
    title: 'Medina course (دروس اللغة العربية)',
    about:
      'By Dr V. Abdur Rahim, formerly of the Islamic University of Medina. According to the PDFs, the book, the solutions and the keys are provided “for personal use only, with kind permission of Dr V. Abdur Rahim”.',
    book: 'Book, solutions, keys, notes: <1>AbdurRahman.org</1> and <3>archive.org</3>; in the lessons we show the book pages as page images that archive.org creates from the PDF and that are loaded from there.',
    print:
      'The same book is available in print as “Madinah Arabic Reader” from <1>Goodword Books</1> (© Goodword). For each lesson we only name the book and page of that edition; we do not show its pages.',
    recordings:
      'Recordings of the lessons by Dr V. Abdur Rahim: <1>archive.org</1>, played straight from there.',
    own: 'Our own content at Suffa: German word meanings, grammar explanations, example sentences and exercises. Which words a lesson introduces is a fact taken from the book.',
  },
  bayna: {
    title: 'Al-Arabiyya bayna Yadayk (العربية بين يديك)',
    media:
      "Audio and page videos for the book: © Arabic for All (العربية للجميع), all rights reserved by the publisher; played from the publisher's server or from YouTube. <1>arabicforall.net</1>",
    own: 'Our own content at Suffa: word lists with meanings, dialogues, verb tables, grammar and exercises.',
  },
  more: {
    title: 'Other sources',
    examples:
      'Example sentences: <1>Tatoeba</1> (<3>CC BY 2.0 FR</3>), vocalised and in part corrected by Suffa; the author is named with every sentence.',
    discover: 'Discover: videos belong to their channels and play via YouTube.',
    fonts: 'Fonts: Amiri, Reem Kufi, Manrope, Fraunces (SIL Open Font License).',
  },
  takedown:
    'If a rights holder wishes otherwise, we will change it or take it down straight away.',
};
