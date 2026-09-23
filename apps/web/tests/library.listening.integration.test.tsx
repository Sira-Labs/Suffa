import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CelebrationToast } from '@/components';
import { PublisherAudio } from '@/modules/library/PublisherAudio';
import { db } from '@/services/storage';
import { useCelebrationStore, useListenStore } from '@/state';

/** Simulates real playback: time moves in small steps; a seek does not count. */
function play(
  audio: HTMLElement,
  duration: number,
  from: number,
  to: number,
  step = 0.5
) {
  Object.defineProperty(audio, 'duration', { configurable: true, value: duration });
  let t = from;
  Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => t });
  fireEvent.play(audio);
  while (t < to) {
    t = Math.min(to, t + step);
    fireEvent.timeUpdate(audio);
  }
}

describe('Listening progress (integration)', () => {
  beforeEach(async () => {
    await db.media_progress.clear();
    await useListenStore.getState().load();
    useCelebrationStore.getState().dismiss();
  });

  it('marks a track as heard, celebrates with XP and updates the lesson count', async () => {
    render(
      <>
        <PublisherAudio />
        <CelebrationToast />
      </>
    );
    const lesson = await screen.findByRole('region', { name: 'الدرس 01' });
    const audio = within(lesson).getByLabelText('Dialog: الحوار الأول (أ)');

    play(audio, 20, 0, 18);
    fireEvent.pause(audio);

    expect(await within(lesson).findByText('Gehört')).toBeInTheDocument();
    expect(within(lesson).getByText('1/3 gehört')).toBeInTheDocument();
    expect(await screen.findByText('+5 XP')).toBeInTheDocument();
    expect(screen.getByText('Dialog gehört')).toBeInTheDocument();
    expect(screen.getByText(/^1 von \d+ Aufnahmen gehört$/)).toBeInTheDocument();
  });

  it('does not count skipping ahead as listening', async () => {
    render(<PublisherAudio />);
    const lesson = await screen.findByRole('region', { name: 'الدرس 01' });
    const audio = within(lesson).getByLabelText('Dialog: الحوار الأول (أ)');

    play(audio, 20, 0, 18, 6); // jumps of 6 s are seeks
    fireEvent.pause(audio);

    await new Promise((r) => setTimeout(r, 50));
    expect(within(lesson).queryByText('Gehört')).not.toBeInTheDocument();
    expect(within(lesson).getByText('0/3 gehört')).toBeInTheDocument();
  });
});
