/**
 * Story 16.3: labels built by shared helpers follow the interface language – unit and page
 * labels, device names, review card prompts and the persons of the conjugation tables.
 * Course content inside them (German meanings) stays German until story 16.4.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setUiLanguage } from '@/i18n';
import { content } from '@/content';
import { Conjugation } from '@/modules/conjugation/Conjugation';
import { describeDevice } from '@/modules/settings/devices';
import { unitLabel } from '@/services/courses';
import { resolveCard } from '@/services/srs';
import { pageLabel } from '@/services/video/bookVideos';

const withPlural = content.vokabeln.find((v) => v.plural && v.wurzel)!;
const verb = content.verben.find((v) => v.einheit !== undefined)!;

describe('shared helper labels in English (integration)', () => {
  beforeEach(async () => {
    await act(() => setUiLanguage('en'));
  });

  afterEach(async () => {
    await act(() => setUiLanguage('de'));
    localStorage.clear();
  });

  it('names units, Medina lessons and book pages in English', () => {
    expect(unitLabel(3)).toBe('Unit 3');
    expect(unitLabel(103)).toBe('Lesson 3');
    const video = { id: 'x', page: 32, approx: true } as Parameters<typeof pageLabel>[0];
    expect(pageLabel(video)).toBe('p. ~32');
  });

  it('names a signed-in device in English', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toBe('Safari on iPhone');
    expect(describeDevice(null)).toBe('Unknown device');
  });

  it('asks review cards in English with the German meaning kept', () => {
    const plural = resolveCard('plural', withPlural.id)!;
    expect(plural.prompt).toBe(`Plural of “${withPlural.ar}” (${withPlural.de})`);
    expect(plural.hint).toBe(`Singular ${withPlural.ar} · root ${withPlural.wurzel}`);
    const conjugation = resolveCard('conjugation', verb.id)!;
    expect(conjugation.prompt).toMatch(/^Conjugate “/);
    expect(conjugation.hint).toBe(`Root ${verb.wurzel} · wazn ${verb.wazn}`);
  });

  it('keeps the German prompts', async () => {
    await act(() => setUiLanguage('de'));
    expect(resolveCard('plural', withPlural.id)!.prompt).toBe(
      `Plural von „${withPlural.ar}“ (${withPlural.de})`
    );
  });

  it('labels the persons of the conjugation table in English', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Conjugation scope={{ unit: verb.einheit ?? 1, onPractised: () => undefined }} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByText('they two (f.)')).toBeInTheDocument();
    expect(screen.queryByText('sie beide (f.)')).toBeNull();
    await user.click(screen.getByRole('button', { name: /الأمر/ }));
    expect(screen.getByText('you (f. pl.)')).toBeInTheDocument();
  });
});
