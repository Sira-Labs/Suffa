import { WEEKLY_GOALS } from '@suffa/engagement';
import { useSearchParams } from 'react-router-dom';
import { TashkilToggle } from '@/components';
import { ApiSyncProvider, SIGN_IN_RETURN_PATH } from '@/services/sync/ApiSyncProvider';
import { SignInForm } from '@/modules/account/SignInForm';
import { useSettingsStore, useSyncStore } from '@/state';
import { AccountDevices } from './AccountDevices';
import { RemindersCard } from './RemindersCard';
import { PrivacyCard } from './PrivacyCard';

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
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span className="stack" style={{ gap: 0 }}>
            <span>Wochenziel</span>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Lerntage pro Woche – ein freier Tag bricht das Ziel nicht
            </span>
          </span>
          <select
            className="input"
            value={settings.weeklyGoal ?? 5}
            onChange={(e) => void update({ weeklyGoal: Number(e.target.value) })}
            style={{ width: 130 }}
          >
            {WEEKLY_GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {goal} Tage
              </option>
            ))}
          </select>
        </label>
      </div>

      <PrivacyCard />

      <SourcesCard />
    </div>
  );
}

function AccountPanel() {
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const signOut = useSyncStore((s) => s.signOut);
  const syncNow = useSyncStore((s) => s.syncNow);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  // Back from the magic link (/settings?angemeldet=1): confirm once.
  const [params] = useSearchParams();
  const justSignedIn = params.get('angemeldet') === '1';
  // A failed link comes back to the same page with ?error=… (expired, already used).
  const linkError = signInLinkError(params.get('error'));

  if (provider instanceof ApiSyncProvider && provider.isServerDown()) {
    return (
      <p className="muted" role="status">
        Der Server ist gerade nicht erreichbar. Dein Lernstand bleibt auf diesem Gerät und
        wird abgeglichen, sobald er wieder da ist – du bleibst angemeldet.
      </p>
    );
  }

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
        <span className="muted">
          Dein Lernstand wird automatisch abgeglichen: beim Öffnen der App, alle paar
          Minuten und kurz nach jeder Übung.
          {lastSyncAt &&
            ` Zuletzt: ${new Date(lastSyncAt).toLocaleString('de-DE', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}.`}
        </span>
        <div className="row">
          <button
            className="btn"
            onClick={() => void syncNow()}
            title="Nur nötig, wenn du sofort auf ein anderes Gerät wechselst"
          >
            Sofort abgleichen
          </button>
          <button className="btn" onClick={() => void signOut()}>
            Abmelden
          </button>
        </div>
        <AccountDevices />
        <RemindersCard />
      </div>
    );
  }

  return (
    <div className="stack">
      {linkError && <span className="feedback-bad">{linkError}</span>}
      <p className="muted" style={{ margin: 0 }}>
        Anmelden ohne Passwort: Du bekommst einen Link per E-Mail. Mit demselben Konto auf
        Handy und Computer wird dein Lernstand automatisch abgeglichen.
      </p>
      <SignInForm returnTo={SIGN_IN_RETURN_PATH} />
    </div>
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

/** German explanation for the error code Better Auth appends to a failed magic link. */
export function signInLinkError(code: string | null): string | null {
  if (!code) return null;
  if (code === 'INVALID_TOKEN' || code === 'EXPIRED_TOKEN') {
    return 'Dieser Anmeldelink ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.';
  }
  return 'Die Anmeldung hat nicht geklappt. Fordere einen neuen Link an.';
}
