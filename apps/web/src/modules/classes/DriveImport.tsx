/**
 * "Aus Google Drive" (story 7.2): connect once, then pick recordings in Google's Picker;
 * Suffa copies them and processes them like uploads. Hidden when the server has no Drive.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import {
  DriveApi,
  driveConnectUrl,
  pickRecordings,
  type DriveStatus,
} from '@/services/media/drive';

/** The `?drive=…` result after connecting, as a catalogue key. */
const RETURN_MESSAGES = {
  connected: 'drive.connected',
  cancelled: 'drive.cancelled',
  failed: 'drive.failed',
} as const;

function returnMessage(value: string | null) {
  return value && Object.prototype.hasOwnProperty.call(RETURN_MESSAGES, value)
    ? RETURN_MESSAGES[value as keyof typeof RETURN_MESSAGES]
    : null;
}

export function DriveImport({
  classId,
  onImported,
}: {
  classId: string;
  onImported: () => void;
}) {
  const { t } = useTranslation('recordings');
  const api = useMemo(() => new DriveApi(), []);
  const { search, pathname } = useLocation();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [returned] = useState(() =>
    returnMessage(new URLSearchParams(search).get('drive'))
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api.status().then((result) => result.ok && setStatus(result.value));
  }, [api]);

  if (!status) return null;

  const pick = async () => {
    const token = await api.token();
    if (!token.ok) return setMessage(token.message);
    try {
      const ids = await pickRecordings(status, token.value.accessToken);
      if (ids.length === 0) return;
      const result = await api.import(classId, ids);
      if (!result.ok) return setMessage(result.message);
      setMessage(t('drive.importing', { count: ids.length }));
      onImported();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setMessage(t('drive.pickerFailed'));
    }
  };

  const shown = message ?? (returned ? t(returned) : null);
  return (
    <div className="card stack">
      <strong>{t('drive.title')}</strong>
      {status.connected ? (
        <div className="row">
          <button className="btn" onClick={() => void pick()}>
            {t('drive.pick')}
          </button>
          <button
            className="btn btn-small"
            onClick={() =>
              void api.disconnect().then(() => setStatus({ ...status, connected: false }))
            }
          >
            {t('drive.disconnect')}
          </button>
        </div>
      ) : (
        <div className="row">
          <a className="btn" href={driveConnectUrl(pathname)}>
            {t('drive.connect')}
          </a>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('drive.privacy')}
          </span>
        </div>
      )}
      {shown && <span className="muted">{shown}</span>}
    </div>
  );
}
