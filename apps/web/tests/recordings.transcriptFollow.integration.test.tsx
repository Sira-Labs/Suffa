/** The transcript under the player: off, one line or all; the list scrolls along. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TranscriptPanel } from '@/modules/classes/player/TranscriptPanel';

const cues = Array.from({ length: 20 }, (_, i) => ({
  start: i * 5,
  end: i * 5 + 5,
  text: `سطر ${i}`,
}));

describe('transcript views', () => {
  afterEach(() => localStorage.clear());

  it('shows one line by default, the whole list or nothing, and remembers it', async () => {
    const { rerender } = render(
      <TranscriptPanel cues={cues} time={12} onSeek={() => {}} />
    );
    expect(document.querySelector('.transcript-now')).toHaveTextContent('سطر 2');
    expect(screen.queryByRole('list')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Alles' }));
    expect(screen.getByRole('list')).toBeTruthy();
    expect(document.querySelector('.transcript-now')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Aus' }));
    expect(screen.queryByRole('list')).toBeNull();
    expect(document.querySelector('.transcript-now')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aus' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(localStorage.getItem('suffa.transcript.view')).toBe('off');

    rerender(<></>);
    render(<TranscriptPanel cues={cues} time={12} onSeek={() => {}} />);
    expect(screen.getByRole('button', { name: 'Aus' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('offers the subtitle switch for videos', async () => {
    const onChange = vi.fn();
    render(
      <TranscriptPanel
        cues={cues}
        time={0}
        onSeek={() => {}}
        subtitles={{ on: true, onChange }}
      />
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Untertitel im Video' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('transcript follow-along', () => {
  // These tests look at the whole list.
  beforeEach(() => localStorage.setItem('suffa.transcript.view', 'full'));
  afterEach(() => localStorage.clear());

  it('scrolls the list to the current line, and stops when switched off', async () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo as never;
    const { rerender } = render(
      <TranscriptPanel cues={cues} time={0} onSeek={() => {}} />
    );
    rerender(<TranscriptPanel cues={cues} time={52} onSeek={() => {}} />);
    expect(scrollTo).toHaveBeenCalled();

    const box = screen.getByRole('checkbox', { name: 'Text mitlaufen lassen' });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(localStorage.getItem('suffa.transcript.follow')).toBe('off');
    scrollTo.mockClear();
    rerender(<TranscriptPanel cues={cues} time={80} onSeek={() => {}} />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('remembers the choice on this device', () => {
    localStorage.setItem('suffa.transcript.follow', 'off');
    render(<TranscriptPanel cues={cues} time={0} onSeek={() => {}} />);
    expect(
      screen.getByRole('checkbox', { name: 'Text mitlaufen lassen' })
    ).not.toBeChecked();
  });

  it('aligns the list again when it is shown again', async () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo as never;
    render(<TranscriptPanel cues={cues} time={52} onSeek={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Eine Zeile' }));
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Alles' }));
    expect(scrollTo).toHaveBeenCalled();
  });
});
