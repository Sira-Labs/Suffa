import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewSession } from '@/modules/vocab';
import { useSettingsStore, useContentStore, useSrsStore } from '@/state';
import { db } from '@/services/storage';
import { resolveCard } from '@/services/srs';

/**
 * Integrationstest eines Lernmoduls: lädt die echten Stores (gegen fake-indexeddb)
 * und durchläuft den Active-Recall-Flow im Vokabeltrainer Ende-zu-Ende.
 */
async function bootStores() {
  await useSettingsStore.getState().load();
  await useContentStore.getState().load();
  await useSrsStore.getState().load();
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('Vokabeltrainer (Integration)', () => {
  it('seedet Karten aus dem Content und stellt eine Recall-Frage', async () => {
    await bootStores();
    const cards = await db.srs_cards.toArray();
    expect(cards.length).toBeGreaterThan(0);

    render(<ReviewSession kinds={['vocab_ar_de']} title="Test AR→DE" />);
    expect(
      await screen.findByRole('heading', { name: 'Test AR→DE' })
    ).toBeInTheDocument();
    // Es gibt ein Eingabefeld für die produktive Antwort (Active Recall).
    expect(screen.getByLabelText('Antwort eingeben')).toBeInTheDocument();
  });

  it('akzeptiert die korrekte Antwort und zeigt Bewertungsknöpfe', async () => {
    await bootStores();
    const user = userEvent.setup();

    const goal = useSettingsStore.getState().settings.dailyGoal;
    const queue = useSrsStore.getState().getQueue(['vocab_ar_de'], goal);
    const firstCard = queue[0]!;
    const resolved = resolveCard(firstCard.kind, firstCard.contentRef, [])!;

    render(<ReviewSession kinds={['vocab_ar_de']} title="Test" />);

    const input = await screen.findByLabelText('Antwort eingeben');
    await user.type(input, resolved.answer);
    await user.click(screen.getByRole('button', { name: 'Prüfen' }));

    // Sofortiges Feedback erscheint und Karte kann bewertet werden.
    await waitFor(() => expect(screen.getByText(/Richtig/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Gut/ })).toBeInTheDocument();
  });

  it('schreibt nach der Bewertung ein Review-Log und füllt die Outbox', async () => {
    await bootStores();
    const user = userEvent.setup();

    const goal = useSettingsStore.getState().settings.dailyGoal;
    const queue = useSrsStore.getState().getQueue(['vocab_ar_de'], goal);
    const resolved = resolveCard(queue[0]!.kind, queue[0]!.contentRef, [])!;

    render(<ReviewSession kinds={['vocab_ar_de']} title="Test" />);
    const input = await screen.findByLabelText('Antwort eingeben');
    await user.type(input, resolved.answer);
    await user.click(screen.getByRole('button', { name: 'Prüfen' }));
    await user.click(await screen.findByRole('button', { name: /Gut/ }));

    await waitFor(async () => {
      expect(await db.review_logs.count()).toBeGreaterThan(0);
    });
    // Outbox enthält mindestens die Kartenaktualisierung + das Log.
    expect(await db.outbox.count()).toBeGreaterThan(0);
  });

  it('akzeptiert eine von mehreren Bedeutungen (بَلَد → „Ort“) und zeigt die übrigen', async () => {
    await bootStores();
    const user = userEvent.setup();
    const balad = useSrsStore
      .getState()
      .cards.find((c) => c.kind === 'vocab_ar_de' && c.contentRef === 'v-balad')!;
    useSrsStore.setState({ cards: [balad] });

    render(<ReviewSession kinds={['vocab_ar_de']} title="Test" />);
    const input = await screen.findByLabelText('Antwort eingeben');
    // German answers are typed left-to-right, not in the Arabic input style.
    expect(input).toHaveAttribute('dir', 'ltr');
    expect(input).not.toHaveClass('arabic-inline');

    await user.type(input, 'ort');
    await user.click(screen.getByRole('button', { name: 'Prüfen' }));

    expect(await screen.findByText('✓ Richtig')).toBeInTheDocument();
    expect(screen.getByText('Auch richtig:')).toBeInTheDocument();
    expect(screen.getByText('Land')).toBeInTheDocument();
  });
});
