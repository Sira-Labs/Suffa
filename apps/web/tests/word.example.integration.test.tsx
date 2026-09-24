import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordExample } from '@/components';
import catalog from '@/content/sources/examples.json';

/** A revealed vocabulary card shows one example sentence with its Tatoeba source. */
describe('Word example (integration)', () => {
  it('shows the sentence, its translation and the attribution', async () => {
    const [example] = catalog.examples['v-bayt']!;
    render(<WordExample vocabId="v-bayt" />);
    expect(await screen.findByText(example!.de)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: `Tatoeba #${example!.tatoeba}` })
    ).toHaveAttribute(
      'href',
      `https://tatoeba.org/de/sentences/show/${example!.tatoeba}`
    );
    expect(screen.getByRole('link', { name: 'CC BY 2.0 FR' })).toBeInTheDocument();
  });

  it('marks own sentences instead of citing Tatoeba', async () => {
    const [example] = catalog.examples['v-zamzam']!;
    render(<WordExample vocabId="v-zamzam" />);
    expect(await screen.findByText(example!.de)).toBeInTheDocument();
    expect(screen.getByText('Eigener Beispielsatz (Suffa)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tatoeba/ })).toBeNull();
  });

  it('renders nothing for a word without example', async () => {
    const { container } = render(<WordExample vocabId="v-does-not-exist" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
