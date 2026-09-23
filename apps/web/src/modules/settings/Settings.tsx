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

  if (!provider.isConfigured()) {
    return (
      <p className="muted">
        Reiner Offline-Modus (keine Supabase-Konfiguration). Alle Daten liegen lokal auf
        diesem Gerät. Für die Geräte-Synchronisation `.env` mit
        <code> VITE_SUPABASE_URL</code> und <code> VITE_SUPABASE_ANON_KEY</code> setzen.
      </p>
    );
  }

  if (auth.status === 'signed-in') {
    return (
      <div className="stack">
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
        ? '✓ Magic-Link gesendet. Prüfe deine E-Mails und öffne den Link auf diesem Gerät.'
        : `Fehler: ${result.message}`
    );
  };

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">
        Melde dich per Magic-Link an. Dasselbe Konto auf Handy und Desktop ⇒ automatischer
        Abgleich des Lernstands.
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
          Magic-Link senden
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
