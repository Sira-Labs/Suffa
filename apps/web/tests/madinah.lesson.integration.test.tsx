/** A Medina lesson page (ADR-0025): own words and grammar, the recording, the book reader. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MadinahLessonPage } from '@/modules/units/MadinahLesson';
import { Sources } from '@/modules/sources';
import { madinahLessonContent } from '@/services/courses';
import { useEnrollmentStore, usePracticeStore, useSettingsStore } from '@/state';

vi.mock('@/services/speech/tts', () => ({ speakArabic: vi.fn() }));
vi.mock('@/services/speech', () => ({
  speakArabic: vi.fn(),
  isTtsSupported: () => false,
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/units/madinah/:lesson', element: <MadinahLessonPage /> },
      { path: '/sources', element: <Sources /> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('Medina lesson page', () => {
  beforeEach(async () => {
    await useSettingsStore.getState().load();
  });

  it('shows the lesson words with German meanings and the grammar in our words', async () => {
    renderAt('/units/madinah/2');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Lektion 2'
    );
    const words = screen.getByRole('region', { name: 'Neue Wörter' });
    expect(within(words).getByRole('button', { name: 'Stein anhören' })).toBeTruthy();
    expect(within(words).getByText('حَجَرٌ')).toBeTruthy();
    const grammar = screen.getByRole('region', { name: 'Grammatik' });
    expect(within(grammar).getByText('Nah und fern: هٰذَا und ذٰلِكَ')).toBeTruthy();
    expect(screen.getByText(/Entwurf: Wortbedeutungen/)).toBeTruthy();
    expect(screen.getByLabelText('Aufnahme Lektion 2')).toHaveAttribute(
      'src',
      'https://archive.org/download/MAA_BK1_VAR/MAA_BK1_VAR_L02.mp3'
    );
    expect(screen.getByRole('link', { name: '← Lektion 1' })).toHaveAttribute(
      'href',
      '/units/madinah/1'
    );
    expect(screen.getByRole('link', { name: 'Lektion 3 →' })).toBeTruthy();
  });

  it('shows the lesson pages of the book as page images, only on request', async () => {
    renderAt('/units/madinah/2');
    const book = await screen.findByRole('region', { name: 'Im Buch' });
    // Lesson 2 runs from page 9 to page 10 (lesson 3 starts on page 11).
    expect(within(book).getByText('Im Buch (S. 9–10)')).toBeTruthy();
    expect(within(book).queryByRole('img')).toBeNull();
    await userEvent.click(within(book).getByRole('button', { name: 'Buch anzeigen' }));
    expect(within(book).getByRole('img', { name: 'Buchseite 9' })).toHaveAttribute(
      'src',
      'https://archive.org/download/madinah_arabic__dr_v_abdur_rahim/book_1/madinah_arabic_1_jp2.zip/madinah_arabic_1_jp2%2Fmadinah_arabic_1_0008.jp2&ext=jpg&reduce=2'
    );
    expect(within(book).getByTitle('Seite groß öffnen')).toHaveAttribute(
      'href',
      'https://archive.org/download/madinah_arabic__dr_v_abdur_rahim/book_1/madinah_arabic_1_jp2.zip/madinah_arabic_1_jp2%2Fmadinah_arabic_1_0008.jp2&ext=jpg'
    );
    expect(within(book).getByText('S. 9 (1 von 2)')).toBeTruthy();
    expect(within(book).getByRole('button', { name: '← Seite' })).toBeDisabled();
    await userEvent.click(within(book).getByRole('button', { name: 'Seite →' }));
    expect(within(book).getByRole('img', { name: 'Buchseite 10' })).toHaveAttribute(
      'src',
      'https://archive.org/download/madinah_arabic__dr_v_abdur_rahim/book_1/madinah_arabic_1_jp2.zip/madinah_arabic_1_jp2%2Fmadinah_arabic_1_0009.jp2&ext=jpg&reduce=2'
    );
    expect(within(book).getByRole('button', { name: 'Seite →' })).toBeDisabled();
    expect(within(book).getByRole('link', { name: 'archive.org' })).toHaveAttribute(
      'href',
      expect.stringMatching(/madinah_arabic_1\.pdf#page=10$/)
    );
    expect(within(book).getByRole('link', { name: 'AbdurRahman.org' })).toHaveAttribute(
      'href',
      expect.stringMatching(/#page=10$/)
    );
    // The next lesson starts with the book closed again.
    await userEvent.click(screen.getByRole('link', { name: 'Lektion 3 →' }));
    const next = await screen.findByRole('region', { name: 'Im Buch' });
    expect(await within(next).findByText('Im Buch (S. 11–17)')).toBeTruthy();
    expect(within(next).queryByRole('img')).toBeNull();
  });

  it('practises the lesson words: right answers count once, wrong ones come back', async () => {
    const user = userEvent.setup();
    await usePracticeStore.getState().load();
    const words = madinahLessonContent(101)!.words;
    renderAt('/units/madinah/1');
    const station = await screen.findByRole('region', { name: 'Wörter üben' });
    const counter = `von ${words.length} geübt`;
    expect(within(station).getByText(`0 ${counter}`)).toBeTruthy();
    await user.click(within(station).getByRole('button', { name: 'Üben' }));

    const shown = () => {
      const listen = within(station).getByRole('button', { name: / anhören$/ });
      const ar = listen.getAttribute('aria-label')!.replace(/ anhören$/, '');
      return words.find((w) => w.ar === ar)!;
    };
    // First word: answer wrong, it comes back later in the round.
    const first = shown();
    const options = within(station).getByRole('group', { name: 'Bedeutung wählen' });
    const wrong = within(options)
      .getAllByRole('button')
      .find((b) => b.textContent !== first.de)!;
    await user.click(wrong);
    expect(within(station).getByRole('status')).toHaveTextContent(
      `Es heißt: ${first.de}`
    );
    await user.click(within(station).getByRole('button', { name: 'Weiter' }));
    expect(
      within(station).getByText(`Noch ${words.length} Wörter in dieser Runde`)
    ).toBeTruthy();

    // Next word: answer right, it is stored as practised.
    const second = shown();
    await user.click(within(station).getByRole('button', { name: second.de }));
    expect(within(station).getByRole('status')).toHaveTextContent('Richtig!');
    expect(usePracticeStore.getState().records[`101:words:${second.id}`]).toMatchObject({
      unit: 101,
      skill: 'words',
      itemId: second.id,
    });
    expect(await within(station).findByText(`1 ${counter}`)).toBeTruthy();
  });

  it('dictation: accepts the word without vowel signs, brings back skipped words', async () => {
    const user = userEvent.setup();
    await usePracticeStore.getState().load();
    const words = madinahLessonContent(101)!.words;
    renderAt('/units/madinah/1');
    const station = await screen.findByRole('region', { name: 'Diktat' });
    await user.click(within(station).getByRole('button', { name: 'Diktat starten' }));
    // Without speech output the word is shown instead.
    const shownWord = () => {
      const hint = within(station).getByText(/das Wort:/);
      return words.find((w) => w.ar === hint.querySelector('[lang="ar"]')!.textContent)!;
    };
    const first = shownWord();
    const input = within(station).getByRole('textbox');
    await user.type(input, 'خطأ');
    await user.click(within(station).getByRole('button', { name: 'Prüfen' }));
    expect(within(station).getByText('✗ Noch nicht richtig')).toBeTruthy();
    // Skipping keeps the word in the round.
    await user.click(within(station).getByRole('button', { name: 'Später' }));
    expect(
      within(station).getByText(`Noch ${words.length} Wörter in dieser Runde`)
    ).toBeTruthy();

    const second = shownWord();
    expect(second.id).not.toBe(first.id);
    const bare = second.ar.replace(/[\u064B-\u065F\u0670]/g, '');
    await user.type(within(station).getByRole('textbox'), bare);
    await user.click(within(station).getByRole('button', { name: 'Prüfen' }));
    expect(within(station).getByText(/✓ Richtig/)).toBeTruthy();
    expect(usePracticeStore.getState().records[`101:write:${second.id}`]).toMatchObject({
      unit: 101,
      skill: 'write',
    });
    expect(
      await within(station).findByText(`1 von ${words.length} geschrieben`)
    ).toBeTruthy();
  });

  it('gap text: a wrong choice retries the sentence, a right one fills and stores it', async () => {
    const user = userEvent.setup();
    await usePracticeStore.getState().load();
    const gap = madinahLessonContent(101)!.gaps[0]!;
    renderAt('/units/madinah/1');
    const station = await screen.findByRole('region', { name: 'Lückentext' });
    await user.click(within(station).getByRole('button', { name: 'Lückentext starten' }));
    expect(within(station).getByText(gap.de)).toBeTruthy();
    const options = within(station).getByRole('group', { name: 'Fehlendes Wort wählen' });
    const wrong = gap.options.find((o) => o !== gap.answer)!;
    await user.click(within(options).getByRole('button', { name: wrong }));
    expect(within(station).getByRole('status')).toHaveTextContent('Nicht ganz');
    await user.click(within(station).getByRole('button', { name: 'Nochmal' }));
    await user.click(within(options).getByRole('button', { name: gap.answer }));
    expect(within(station).getByRole('status')).toHaveTextContent('Richtig!');
    expect(usePracticeStore.getState().records['101:cloze:gap-1']).toMatchObject({
      skill: 'cloze',
    });
    await user.click(within(station).getByRole('button', { name: 'Weiter' }));
    expect(
      within(station).getByText('Satz 2 von ' + madinahLessonContent(101)!.gaps.length)
    ).toBeTruthy();
  });

  it('lesson test: all right passes, is stored like a unit test and shows the best result', async () => {
    const user = userEvent.setup();
    await useEnrollmentStore.getState().load();
    const content = madinahLessonContent(102)!;
    renderAt('/units/madinah/2');
    const station = await screen.findByRole('region', { name: 'Lektionstest' });
    await user.click(
      within(station).getByRole('button', { name: /Test starten|Test wiederholen/ })
    );
    const total = content.words.length + content.gaps.length;
    for (let n = 1; n <= total; n++) {
      expect(within(station).getByText(`Frage ${n} von ${total}`)).toBeTruthy();
      // A gap question shows its German sentence; otherwise it asks a word's meaning.
      const gap = content.gaps.find((g) => within(station).queryByText(g.de));
      const word = content.words.find((w) =>
        within(station).queryByText(w.ar, { selector: '[lang="ar"]:not(button)' })
      );
      const expected = gap ? gap.answer : word!.de;
      const group = within(station).getByRole('group', { name: 'Antwort wählen' });
      await user.click(within(group).getByRole('button', { name: expected }));
      await user.click(
        within(station).getByRole('button', {
          name: n === total ? 'Test abgeben' : 'Weiter',
        })
      );
    }
    expect(within(station).getByRole('status')).toHaveTextContent(
      `Bestanden! – ${total} von ${total} richtig`
    );
    // The result is saved after the last answer.
    await waitFor(() =>
      expect(
        useEnrollmentStore
          .getState()
          .exams.find((e) => e.format === 'madinah_lesson' && e.units[0] === 102)
      ).toMatchObject({ score: total, total })
    );
    expect(
      await within(station).findByText(
        `Bestes Ergebnis: ${total} von ${total} · bestanden`
      )
    ).toBeTruthy();
  });

  it('ends the last lesson at the last page of the book', async () => {
    renderAt('/units/madinah/23');
    expect(await screen.findByText('Im Buch (S. 117–120)')).toBeTruthy();
  });

  it('points to the PDF when archive.org cannot deliver a page image', async () => {
    renderAt('/units/madinah/2');
    const book = await screen.findByRole('region', { name: 'Im Buch' });
    await userEvent.click(within(book).getByRole('button', { name: 'Buch anzeigen' }));
    fireEvent.error(within(book).getByRole('img', { name: 'Buchseite 9' }));
    expect(within(book).getByRole('alert')).toHaveTextContent(
      'Seite 9 lässt sich gerade nicht laden'
    );
    // The next page tries its own image again.
    await userEvent.click(within(book).getByRole('button', { name: 'Seite →' }));
    expect(within(book).getByRole('img', { name: 'Buchseite 10' })).toBeTruthy();
    expect(within(book).queryByRole('alert')).toBeNull();
  });

  it('names where the lesson is in the printed Goodword edition', async () => {
    const { unmount } = renderAt('/units/madinah/5');
    const book = await screen.findByRole('region', { name: 'Im Buch' });
    expect(within(book).getByText(/Buch 1, S\. 37$/)).toBeTruthy();
    expect(within(book).getByRole('link', { name: 'Goodword' })).toHaveAttribute(
      'href',
      'https://www.goodwordbooks.com/'
    );
    unmount();
    // Goodword's book 2 starts with our lesson 11.
    renderAt('/units/madinah/11');
    const second = await screen.findByRole('region', { name: 'Im Buch' });
    expect(within(second).getByText(/Buch 2, S\. 5$/)).toBeTruthy();
  });

  it('points to the book for lessons without own content yet, and handles unknown ones', async () => {
    const { unmount } = renderAt('/units/madinah/7');
    expect(
      await screen.findByText(/Wörter und Grammatik zu dieser Lektion folgen/)
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Im Buch' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Lektion 8/ })).toBeTruthy();
    unmount();
    renderAt('/units/madinah/99');
    expect(await screen.findByText('Diese Lektion gibt es nicht.')).toBeTruthy();
  });
});

describe('Sources page', () => {
  it('names every source with its terms and links to the originals', async () => {
    renderAt('/sources');
    expect(
      await screen.findByRole('heading', { name: 'Quellen & Lizenzen' })
    ).toBeTruthy();
    for (const name of [/Medina-Kurs/, /Al-Arabiyya bayna Yadayk/, 'Weitere Quellen']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    expect(screen.getByText(/nur zur persönlichen Nutzung/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'AbdurRahman.org' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    expect(screen.getByRole('link', { name: 'CC BY 2.0 FR' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Goodword Books' })).toBeTruthy();
  });
});
