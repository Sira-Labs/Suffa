import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { TashkilToggle } from '@/components';
import { useSettingsStore, useSyncStore } from '@/state';

export function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Einstellungen</h1>

      <div className="card stack">
        <strong>Konto & Synchronisation</strong>
        <AccountPanel />
      </div>

      <div className="card stack">
        <strong>Darstellung</strong>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>Design</span>
          <button className="btn" onClick={() => void toggleTheme()}>
            {settings.theme === 'dark' ? '🌙 Dunkel' : '☀️ Hell'} – umschalten
          </button>
        </div>
        <TashkilToggle />
        <label className="stack" style={{ gap: '0.3rem' }}>
          <span>Arabische Schriftgröße: {settings.arabicFontScale.toFixed(1)}×</span>
          <input
            type="range"
            min={0.8}
            max={1.8}
            step={0.1}
            value={settings.arabicFontScale}
            onChange={(e) => void update({ arabicFontScale: Number(e.target.value) })}
          />
        </label>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>Umschrift anzeigen</span>
          <input
            type="checkbox"
            checked={settings.showTransliteration}
            onChange={(e) => void update({ showTransliteration: e.target.checked })}
          />
        </label>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>Golf-Dialekt-Randnotizen (nicht prüfungsrelevant)</span>
          <input
            type="checkbox"
            checked={settings.dialectNotes}
            onChange={(e) => void update({ dialectNotes: e.target.checked })}
          />
        </label>
      </div>

      <div className="card stack">
        <strong>Lernen</strong>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>Tagesziel (Karten)</span>
          <input
            className="input"
            type="number"
            min={5}
            max={200}
            value={settings.dailyGoal}
            onChange={(e) => void update({ dailyGoal: Number(e.target.value) })}
            style={{ width: 100 }}
          />
        </label>
      </div>

      <SourcesCard />
    </div>
  );
}

function AccountPanel() {
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const signIn = useSyncStore((s) => s.signIn);
  const signOut = useSyncStore((s) => s.signOut);
  const syncNow = useSyncStore((s) => s.syncNow);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  // Back from the magic link (/settings?angemeldet=1): confirm once.
  const [params] = useSearchParams();
  const justSignedIn = params.get('angemeldet') === '1';

  if (!provider.isConfigured()) {
    return (
      <p className="muted">
        Offline-Modus: Alle Daten liegen lokal auf diesem Gerät. Die Anmeldung für den
        Abgleich zwischen Geräten ist auf diesem Server noch nicht eingerichtet.
      </p>
    );
  }

  if (auth.status === 'signed-in') {
    return (
      <div className="stack">
        {justSignedIn && (
          <span className="feedback-good">
            ✓ Du bist angemeldet. Dein Lernstand wird abgeglichen.
          </span>
        )}
        <span>
          Angemeldet als <strong>{auth.user.email ?? auth.user.id}</strong>
        </span>
        {lastSyncAt && (
          <span className="muted">
            Letzter Sync: {new Date(lastSyncAt).toLocaleString('de-DE')}
          </span>
        )}
        <div className="row">
          <button className="btn btn-primary" onClick={() => void syncNow()}>
            Jetzt synchronisieren
          </button>
          <button className="btn" onClick={() => void signOut()}>
            Abmelden
          </button>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const result = await signIn(email);
    setMessage(
      result.ok
        ? '✓ Link gesendet. Öffne die E-Mail auf diesem Gerät und tippe auf „Bei Suffa anmelden“ – der Link gilt 15 Minuten.'
        : `Fehler: ${result.message}`
    );
  };

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">
        Anmelden ohne Passwort: Du bekommst einen Link per E-Mail. Mit demselben Konto auf
        Handy und Computer wird dein Lernstand automatisch abgeglichen.
      </p>
      <div className="row">
        <input
          className="input"
          type="email"
          placeholder="du@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="btn btn-primary" type="submit">
          Link senden
        </button>
      </div>
      {message && (
        <span className={message.startsWith('✓') ? 'feedback-good' : 'feedback-bad'}>
          {message}
        </span>
      )}
    </form>
  );
}

/** Sources and licences of the content the app shows (attribution for CC BY material). */
function SourcesCard() {
  return (
    <section className="card stack" aria-labelledby="sources-title">
      <strong id="sources-title">Quellen & Lizenzen</strong>
      <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem', gap: '0.4rem' }}>
        <li>
          <strong>Beispielsätze:</strong>{' '}
          <a href="https://tatoeba.org" target="_blank" rel="noreferrer">
            Tatoeba
          </a>{' '}
          (
          <a
            href="https://creativecommons.org/licenses/by/2.0/fr/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 2.0 FR
          </a>
          ), von Suffa vokalisiert und teils berichtigt; die Autorin oder der Autor steht
          bei jedem Satz.
        </li>
        <li>
          <strong>Audio und Seitenvideos zum Buch:</strong> © Arabic for All (العربية
          للجميع), alle Rechte beim Verlag; wird vom Verlag bzw. YouTube abgespielt.
        </li>
        <li>
          <strong>Entdecken:</strong> Videos gehören ihren Kanälen und laufen über
          YouTube.
        </li>
        <li>
          <strong>Wortlisten, Dialoge, Verbtabellen:</strong> eigene Inhalte von Suffa.
        </li>
        <li>
          <strong>Schriften:</strong> Amiri, Reem Kufi, Manrope, Fraunces (SIL Open Font
          License).
        </li>
      </ul>
    </section>
  );
}
