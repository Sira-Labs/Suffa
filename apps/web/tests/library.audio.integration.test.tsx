import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublisherAudio } from '@/modules/library/PublisherAudio';
import index from '@/content/sources/book1-audio.json';

/** The official Book 1 audio: all 16 units plus both exams, filterable, streamed from the publisher. */
describe('Publisher audio (integration)', () => {
  it('ships an index for all 16 units and both exams, only publisher URLs', () => {
    expect(index.units.filter((u) => u.kind === 'unit')).toHaveLength(16);
    expect(index.units.filter((u) => u.kind === 'exam')).toHaveLength(2);
    const urls = index.units.flatMap((u) =>
      u.lessons.flatMap((l) => l.tracks.map((t) => t.url))
    );
    expect(urls.length).toBeGreaterThan(400);
    expect(urls.every((u) => u.startsWith('https://old.arabicforall.net/sounds/'))).toBe(
      true
    );
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('shows the lessons of unit 1 with players that stream from the publisher', async () => {
    render(<PublisherAudio />);
    expect(await screen.findByRole('heading', { name: 'Einheit 1' })).toBeInTheDocument();
    const lesson = screen.getByRole('region', { name: 'الدرس 01' });
    const player = within(lesson).getByLabelText('Dialog: الحوار الأول (أ)');
    expect(player).toHaveAttribute(
      'src',
      'https://old.arabicforall.net/sounds/1st_Audio_Book/unit01/lesson01/01.mp3'
    );
    expect(player).toHaveAttribute('preload', 'none');
    expect(screen.getByText(/alle Rechte beim Verlag/)).toBeInTheDocument();
  });

  it('switches units and filters by kind', async () => {
    const user = userEvent.setup();
    render(<PublisherAudio />);
    await screen.findByRole('heading', { name: 'Einheit 1' });

    await user.click(screen.getByRole('button', { name: '4' }));
    expect(screen.getByRole('heading', { name: 'Einheit 4' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Vokabeln' }));
    const labels = screen
      .getAllByLabelText(/^[^:]+: /)
      .map((el) => el.getAttribute('aria-label') ?? '');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l.startsWith('Vokabeln:'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Abschlusstest' }));
    expect(screen.getByRole('heading', { name: 'Abschlusstest' })).toBeInTheDocument();
  });
});
