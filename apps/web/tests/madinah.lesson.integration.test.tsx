/** A Medina lesson page (ADR-0025): own words and grammar, the recording, the book reader. */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MadinahLessonPage } from '@/modules/units/MadinahLesson';
import { Sources } from '@/modules/sources';
import { useSettingsStore } from '@/state';

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

  it('opens the book in the archive.org reader at the lesson page, only on request', async () => {
    renderAt('/units/madinah/2');
    const book = await screen.findByRole('region', { name: 'Im Buch' });
    expect(within(book).queryByTitle('Buch, Seite 9')).toBeNull();
    await userEvent.click(within(book).getByRole('button', { name: 'Buch anzeigen' }));
    expect(within(book).getByTitle('Buch, Seite 9')).toHaveAttribute(
      'src',
      'https://archive.org/embed/madinah_arabic__dr_v_abdur_rahim/book_1/madinah_arabic_1.pdf/page/n8/mode/1up'
    );
    expect(
      within(book).getByRole('link', { name: 'Bei archive.org öffnen' })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/details/madinah_arabic__dr_v_abdur_rahim/')
    );
    expect(within(book).getByRole('link', { name: 'als PDF' })).toHaveAttribute(
      'href',
      expect.stringMatching(/#page=9$/)
    );
    await userEvent.click(within(book).getByRole('button', { name: 'Buch schließen' }));
    expect(within(book).queryByTitle('Buch, Seite 9')).toBeNull();
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
  });
});
