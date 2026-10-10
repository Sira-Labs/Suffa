import { WEEKLY_GOALS } from '@suffa/engagement';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { TashkilToggle } from '@/components';
import i18n, { setUiLanguage, type UiLanguage } from '@/i18n';
import { dateLocale } from '@/i18n/format';
import { isMeaningLanguage } from '@/services/meanings';
import { ApiSyncProvider, SIGN_IN_RETURN_PATH } from '@/services/sync/ApiSyncProvider';
import { PasskeySignIn } from '@/modules/account/PasskeySignIn';
import { SignInForm } from '@/modules/account/SignInForm';
import { useSettingsStore, useSyncStore } from '@/state';
import { AccountDevices } from './AccountDevices';
import { RemindersCard } from './RemindersCard';
import { PrivacyCard } from './PrivacyCard';

export function Settings() {
  const { t } = useTranslation(['settings', 'common']);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>{t('title')}</h1>

      <div className="card stack">
        <strong>{t('account.title')}</strong>
        <AccountPanel />
      </div>

      <div className="card stack">
        <strong>{t('display.title')}</strong>
        <LanguageSetting />
        <MeaningLanguageSetting />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>{t('display.design')}</span>
          <button className="btn" onClick={() => void toggleTheme()}>
            {t('display.toggle', {
              current: settings.theme === 'dark' ? t('display.dark') : t('display.light'),
            })}
          </button>
        </div>
        <TashkilToggle />
        <label className="stack" style={{ gap: '0.3rem' }}>
          <span>
            {t('display.fontScale', { scale: settings.arabicFontScale.toFixed(1) })}
          </span>
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
          <span>{t('display.transliteration')}</span>
          <input
            type="checkbox"
            checked={settings.showTransliteration}
            onChange={(e) => void update({ showTransliteration: e.target.checked })}
          />
        </label>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>{t('display.dialectNotes')}</span>
          <input
            type="checkbox"
            checked={settings.dialectNotes}
            onChange={(e) => void update({ dialectNotes: e.target.checked })}
          />
        </label>
      </div>

      <div className="card stack">
        <strong>{t('learning.title')}</strong>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span>{t('learning.dailyGoal')}</span>
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
            <span>{t('learning.weeklyGoal')}</span>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('learning.weeklyGoalHint')}
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
                {t('learning.weeklyGoalDays', { count: goal })}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span className="stack" style={{ gap: 0 }}>
            <span>{t('learning.schedule')}</span>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('learning.scheduleHint')}
            </span>
          </span>
          <select
            className="input"
            value={settings.srsAlgorithm ?? 'sm2'}
            onChange={(e) =>
              void update({ srsAlgorithm: e.target.value === 'fsrs' ? 'fsrs' : 'sm2' })
            }
            style={{ width: 160, flexShrink: 0 }}
          >
            <option value="sm2">{t('learning.classic')}</option>
            <option value="fsrs">{t('learning.fsrs')}</option>
          </select>
        </label>
      </div>

      <PrivacyCard />

      <SourcesCard />
    </div>
  );
}

/** Interface language (story 16.3): synced, and kept on the device for the next start. */
function LanguageSetting() {
  const { t } = useTranslation(['settings', 'common']);
  const update = useSettingsStore((s) => s.update);
  const current: UiLanguage = i18n.language === 'en' ? 'en' : 'de';
  const choose = async (language: UiLanguage) => {
    await setUiLanguage(language);
    await update({ uiLanguage: language });
  };
  return (
    <label className="row" style={{ justifyContent: 'space-between' }}>
      <span className="stack" style={{ gap: 0 }}>
        <span>{t('display.language')}</span>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {t('display.languageHint')}
        </span>
      </span>
      <select
        className="input"
        value={current}
        onChange={(e) => void choose(e.target.value === 'en' ? 'en' : 'de')}
        style={{ width: 160, flexShrink: 0 }}
      >
        {/* Each language names itself, so it can be found from either side. */}
        <option value="de" lang="de">
          Deutsch
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}

/** Meaning language (story 16.4): glosses and translation answers; by default as the UI. */
function MeaningLanguageSetting() {
  const { t } = useTranslation(['settings', 'common']);
  const choice = useSettingsStore((s) => s.settings.meaningLanguage ?? null);
  const update = useSettingsStore((s) => s.update);
  return (
    <label className="row" style={{ justifyContent: 'space-between' }}>
      <span className="stack" style={{ gap: 0 }}>
        <span>{t('display.meaningLanguage')}</span>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {t('display.meaningLanguageHint')}
        </span>
      </span>
      <select
        className="input"
        value={choice ?? ''}
        onChange={(e) =>
          void update({
            meaningLanguage: isMeaningLanguage(e.target.value) ? e.target.value : null,
          })
        }
        style={{ width: 160, flexShrink: 0 }}
      >
        <option value="">{t('display.meaningFollowsUi')}</option>
        <option value="de" lang="de">
          Deutsch
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}

function AccountPanel() {
  const { t } = useTranslation(['settings', 'common']);
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
        {t('account.serverDown')}
      </p>
    );
  }

  if (!provider.isConfigured()) {
    return <p className="muted">{t('account.offline')}</p>;
  }

  if (auth.status === 'signed-in') {
    return (
      <div className="stack">
        {justSignedIn && (
          <span className="feedback-good">{t('account.justSignedIn')}</span>
        )}
        <span>
          <Trans
            t={t}
            i18nKey="account.signedInAs"
            values={{ who: auth.user.email ?? auth.user.id }}
            components={{ 1: <strong /> }}
          />
        </span>
        <span className="muted">
          {t('account.autoSync')}
          {lastSyncAt &&
            t('account.lastSync', {
              when: new Date(lastSyncAt).toLocaleString(dateLocale(), {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
        </span>
        <div className="row">
          <button
            className="btn"
            onClick={() => void syncNow()}
            title={t('account.syncNowHint')}
          >
            {t('account.syncNow')}
          </button>
          <button className="btn" onClick={() => void signOut()}>
            {t('common:signOut')}
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
        {t('account.signInIntro')}
      </p>
      <SignInForm returnTo={SIGN_IN_RETURN_PATH} />
      <PasskeySignIn />
    </div>
  );
}

/** Sources and licences of the content the app shows (the full list is its own page). */
function SourcesCard() {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <section className="card stack" aria-labelledby="sources-title">
      <strong id="sources-title">{t('sources.title')}</strong>
      <p className="muted" style={{ margin: 0 }}>
        {t('sources.intro')}
      </p>
      <Link to="/sources">{t('sources.link')}</Link>
    </section>
  );
}

/** Explanation for the error code Better Auth appends to a failed magic link. */
export function signInLinkError(code: string | null): string | null {
  if (!code) return null;
  if (code === 'INVALID_TOKEN' || code === 'EXPIRED_TOKEN') {
    return i18n.t('account:linkExpired');
  }
  return i18n.t('account:linkFailed');
}
