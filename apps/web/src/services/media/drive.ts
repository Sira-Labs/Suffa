/**
 * Google Drive import for teachers (story 7.2): connection status, the Google Picker (loaded
 * on demand from apis.google.com, allowed by the CSP) and the import request.
 */
import { apiRequest, type Fetch } from '@/services/api/request';

export interface DriveStatus {
  connected: boolean;
  apiKey: string;
  appId: string;
}

const MESSAGES: Record<string, string> = {
  not_connected: 'Google Drive ist nicht (mehr) verbunden. Bitte neu verbinden.',
  unsupported_type: 'Bitte nur Audio- oder Videodateien auswählen.',
  too_large: 'Eine Datei ist zu groß (höchstens 10 GB).',
  quota_exceeded: 'Der Speicher dieser Klasse ist voll (50 GB).',
  not_accessible: 'Auf eine Datei gibt es keinen Zugriff.',
};

export class DriveApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  status() {
    return apiRequest<DriveStatus>(this.fetchImpl, '/api/v1/drive', {}, MESSAGES);
  }

  token() {
    return apiRequest<{ accessToken: string }>(
      this.fetchImpl,
      '/api/v1/drive/token',
      { method: 'POST' },
      MESSAGES
    );
  }

  disconnect() {
    return apiRequest<void>(
      this.fetchImpl,
      '/api/v1/drive',
      { method: 'DELETE' },
      MESSAGES
    );
  }

  import(classId: string, fileIds: string[]) {
    return apiRequest<{ ids: string[] }>(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/media/drive`,
      { method: 'POST', body: JSON.stringify({ fileIds }) },
      MESSAGES
    );
  }
}

/** Full-page navigation to Google's consent; comes back to `returnTo`. */
export function driveConnectUrl(returnTo: string): string {
  return `/api/v1/drive/connect?returnTo=${encodeURIComponent(returnTo)}`;
}

/* Minimal typings of the parts of gapi / google.picker used here. */
interface DocsView {
  setIncludeFolders(include: boolean): DocsView;
  setSelectFolderEnabled(enabled: boolean): DocsView;
  setEnableDrives(enabled: boolean): DocsView;
  setOwnedByMe(owned: boolean): DocsView;
  setLabel(label: string): DocsView;
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setCallback(
    cb: (data: { action: string; docs?: { id: string }[] }) => void
  ): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface GooglePicker {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
  Action: { PICKED: string; CANCEL: string };
}
declare global {
  interface Window {
    gapi?: { load(name: string, cb: () => void): void };
    google?: { picker?: GooglePicker };
  }
}

const GAPI_URL = 'https://apis.google.com/js/api.js';
let loading: Promise<GooglePicker> | null = null;

function loadPicker(): Promise<GooglePicker> {
  loading ??= new Promise<GooglePicker>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GAPI_URL;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Google Picker could not be loaded'));
    };
    script.onload = () =>
      window.gapi!.load('picker', () =>
        window.google?.picker
          ? resolve(window.google.picker)
          : reject(new Error('no picker'))
      );
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens the Picker; resolves with the chosen file ids (empty when cancelled). */
export async function pickRecordings(status: DriveStatus, accessToken: string) {
  const picker = await loadPicker();
  return new Promise<string[]>((resolve) => {
    // Folders stay browsable (recordings often sit in a course folder), files shared with
    // the teacher and shared drives get their own tabs. No type filter: Drive often labels
    // an MP4 as `application/octet-stream`, which a filter greys out; the server decides
    // by type and file extension instead.
    const view = (label: string) =>
      new picker.DocsView(picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setLabel(label);
    new picker.PickerBuilder()
      .addView(view('Meine Ablage').setOwnedByMe(true))
      .addView(view('Für mich freigegeben').setOwnedByMe(false))
      .addView(view('Geteilte Ablagen').setEnableDrives(true))
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(status.apiKey)
      .setAppId(status.appId)
      .setLocale('de')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED)
          resolve((data.docs ?? []).map((d) => d.id));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}
