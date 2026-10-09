import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Speaking } from '@/modules/speaking';
import { SpeechApi, type Assessment } from '@/services/speech';
import { SharingApi } from '@/services/sharing/sharingApi';

/**
 * iPhone scenario end to end on the real speaking page: iOS speech recognition
 * refuses → instead of silence, specific instructions appear.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Speaking (integration, iPhone)', () => {
  it('shows instructions when iOS denies speech recognition', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    );
    class DeniedRecognition {
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      continuous = false;
      onresult = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend = null;
      stop() {}
      start() {
        queueMicrotask(() => this.onerror?.({ error: 'service-not-allowed' }));
      }
    }
    vi.stubGlobal('webkitSpeechRecognition', DeniedRecognition);

    render(<Speaking />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Aussprache bewerten/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Diktierfunktion/);
    expect(screen.getByRole('button', { name: /Aussprache bewerten/ })).toBeEnabled();
  });

  it('shows instructions when microphone access is denied', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    );
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported = () => true;
      }
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')),
      },
    });

    render(<Speaking />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Aufnehmen/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Safari → Mikrofon/);
  });
});

/** Stories 15.2/15.3: letter feedback from the browser or from the learner's own recording. */
describe('Speaking (integration, letter feedback)', () => {
  const assessment: Assessment = {
    score: 0.75,
    letters: [
      { index: 0, letter: 'ح', word: 0, status: 'wrong', heard: 'ه' },
      { index: 2, letter: 'ب', word: 0, status: 'good', heard: 'ب' },
      { index: 4, letter: 'ع', word: 0, status: 'check', heard: null },
    ],
    tips: ['ح (ḥa): kräftig gehauchtes h aus der engen Kehle.'],
    transcript: 'هب',
  };

  function fakeMicrophone() {
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
    });
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported = (type: string) => type === 'audio/mp4';
        mimeType = 'audio/mp4';
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        start() {}
        stop() {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(4096)]) });
          this.onstop?.();
        }
      }
    );
    // jsdom has no object URLs.
    Object.assign(URL, { createObjectURL: () => 'blob:clip' });
  }

  it('rates the recording just made on the server, without speaking again', async () => {
    fakeMicrophone();
    const api = new SpeechApi();
    vi.spyOn(api, 'settings').mockResolvedValue({ ok: true, value: { server: true } });
    const assess = vi
      .spyOn(api, 'assess')
      .mockResolvedValue({ ok: true, value: assessment });
    const user = userEvent.setup();

    render(<Speaking speechApi={api} />);
    await user.click(screen.getByRole('button', { name: /Aufnehmen/ }));
    await user.click(await screen.findByRole('button', { name: /Aufnahme stoppen/ }));
    await user.click(await screen.findByRole('button', { name: /Aufnahme bewerten/ }));

    expect(await screen.findByText(/75 % der Laute erkannt/)).toBeInTheDocument();
    const toWork = screen.getByRole('list', { name: 'Laute zum Üben' });
    expect(toWork).toHaveTextContent('ح gehört als ه');
    expect(toWork).toHaveTextContent('ع nicht gehört');
    expect(screen.getByText(/kräftig gehauchtes h/)).toBeInTheDocument();
    expect(assess).toHaveBeenCalledTimes(1);
    const [, recording] = assess.mock.calls[0]!;
    expect(recording.mimeType).toBe('audio/mp4');
    expect(recording.blob.size).toBe(4096);
  });

  it('shares the rated recording with the class teacher, score included', async () => {
    fakeMicrophone();
    const api = new SpeechApi();
    vi.spyOn(api, 'settings').mockResolvedValue({ ok: true, value: { server: true } });
    vi.spyOn(api, 'assess').mockResolvedValue({ ok: true, value: assessment });
    const sharing = new SharingApi();
    vi.spyOn(sharing, 'mine').mockResolvedValue({
      ok: true,
      value: {
        targets: [{ classId: 'c1', name: 'Arabisch 1a', allowed: true }],
        items: [],
      },
    });
    const share = vi
      .spyOn(sharing, 'share')
      .mockResolvedValue({ ok: true, value: { id: 'r1' } });
    const user = userEvent.setup();

    render(<Speaking speechApi={api} sharingApi={sharing} />);
    await user.click(screen.getByRole('button', { name: /Aufnehmen/ }));
    await user.click(await screen.findByRole('button', { name: /Aufnahme stoppen/ }));
    await user.click(await screen.findByRole('button', { name: /Aufnahme bewerten/ }));
    await screen.findByText(/75 % der Laute erkannt/);
    await user.click(
      screen.getByRole('button', { name: /Mit Lehrkraft von Arabisch 1a teilen/ })
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/geteilt/);
    const [input] = share.mock.calls[0]!;
    expect(input).toMatchObject({ classId: 'c1', score: 0.75 });
    expect(input.recording.mimeType).toBe('audio/mp4');
  });

  it('says why the server could not rate it', async () => {
    fakeMicrophone();
    const api = new SpeechApi();
    vi.spyOn(api, 'settings').mockResolvedValue({ ok: true, value: { server: true } });
    vi.spyOn(api, 'assess').mockResolvedValue({
      ok: false,
      status: 429,
      code: 'rate_limited',
      message: 'Sehr viele Bewertungen in kurzer Zeit – bitte einen Moment warten.',
    });
    const user = userEvent.setup();

    render(<Speaking speechApi={api} />);
    await user.click(screen.getByRole('button', { name: /Aufnehmen/ }));
    await user.click(await screen.findByRole('button', { name: /Aufnahme stoppen/ }));
    await user.click(await screen.findByRole('button', { name: /Aufnahme bewerten/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/einen Moment warten/);
  });

  it('offers no server rating when the class turned it off', async () => {
    fakeMicrophone();
    const api = new SpeechApi();
    vi.spyOn(api, 'settings').mockResolvedValue({ ok: true, value: { server: false } });
    const user = userEvent.setup();

    render(<Speaking speechApi={api} />);
    await user.click(screen.getByRole('button', { name: /Aufnehmen/ }));
    await user.click(await screen.findByRole('button', { name: /Aufnahme stoppen/ }));
    await screen.findByRole('button', { name: /Aufnehmen/ });
    expect(screen.queryByRole('button', { name: /Aufnahme bewerten/ })).toBeNull();
  });

  it('rates live speech in the browser letter by letter', async () => {
    class HearingRecognition {
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror = null;
      onend = null;
      stop() {}
      start() {
        queueMicrotask(() =>
          this.onresult?.({ results: [[{ transcript: 'مرحبا', confidence: 0.9 }]] })
        );
      }
    }
    vi.stubGlobal('SpeechRecognition', HearingRecognition);
    const api = new SpeechApi();
    vi.spyOn(api, 'settings').mockResolvedValue({
      ok: false,
      status: 401,
      code: '',
      message: '',
    });

    render(<Speaking speechApi={api} />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Aussprache bewerten/ }));

    expect(await screen.findByText(/der Laute erkannt/)).toBeInTheDocument();
    expect(screen.getByText(/Gehört:/)).toHaveTextContent('مرحبا');
  });
});
