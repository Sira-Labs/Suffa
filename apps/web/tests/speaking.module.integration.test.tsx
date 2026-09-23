import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Speaking } from '@/modules/speaking';

/**
 * iPhone-Szenario Ende-zu-Ende in der echten Sprechen-Seite: Die iOS-Spracherkennung
 * lehnt ab → statt Stille erscheint eine konkrete Anleitung.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sprechen (Integration, iPhone)', () => {
  it('zeigt eine Anleitung, wenn iOS die Spracherkennung verweigert', async () => {
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

  it('zeigt eine Anleitung, wenn das Mikrofon verweigert wird', async () => {
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
