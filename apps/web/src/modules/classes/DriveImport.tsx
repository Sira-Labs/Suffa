/**
 * "Aus Google Drive" (story 7.2): connect once, then pick recordings in Google's Picker;
 * Suffa copies them and processes them like uploads. Hidden when the server has no Drive.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DriveApi,
  driveConnectUrl,
  pickRecordings,
  type DriveStatus,
} from '@/services/media/drive';

const RETURN_MESSAGES: Record<string, string> = {
  connected: 'Google Drive ist verbunden.',
  cancelled: 'Verbindung abgebrochen.',
  failed: 'Google Drive konnte nicht verbunden werden.',
};

export function DriveImport({
  classId,
  onImported,
}: {
  classId: string;
  onImported: () => void;
}) {
  const api = useMemo(() => new DriveApi(), []);
  const { search, pathname } = useLocation();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [message, setMessage] = useState<string | null>(
    RETURN_MESSAGES[new URLSearchParams(search).get('drive') ?? ''] ?? null
  );

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
      setMessage(
        `${ids.length === 1 ? 'Eine Aufnahme wird' : `${ids.length} Aufnahmen werden`} importiert.`
      );
      onImported();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setMessage('Die Google-Auswahl konnte nicht geladen werden.');
    }
  };

  return (
    <div className="card stack">
      <strong>Aus Google Drive</strong>
      {status.connected ? (
        <div className="row">
          <button className="btn" onClick={() => void pick()}>
            Aufnahmen auswählen
          </button>
          <button
            className="btn btn-small"
            onClick={() =>
              void api.disconnect().then(() => setStatus({ ...status, connected: false }))
            }
          >
            Trennen
          </button>
        </div>
      ) : (
        <div className="row">
          <a className="btn" href={driveConnectUrl(pathname)}>
            Google Drive verbinden
          </a>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Suffa sieht nur die Dateien, die du selbst auswählst.
          </span>
        </div>
      )}
      {message && <span className="muted">{message}</span>}
    </div>
  );
}
