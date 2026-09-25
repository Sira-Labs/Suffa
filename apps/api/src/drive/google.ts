/**
 * Google OAuth and Drive for the recording import (story 7.2, ADR-0018). Scope `drive.file`
 * only: Suffa can read just the files the teacher picks in the Picker, nothing else.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface GoogleClient {
  authUrl(state: string): string;
  /** Code from the consent screen → refresh token (offline access). */
  exchangeCode(code: string): Promise<{ refreshToken: string; accessToken: string }>;
  accessToken(refreshToken: string): Promise<string>;
  file(accessToken: string, fileId: string): Promise<DriveFile>;
  /** Streams the file's content (a Response with a body). */
  download(accessToken: string, fileId: string): Promise<Response>;
  revoke(token: string): Promise<void>;
}

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export class HttpGoogleClient implements GoogleClient {
  constructor(
    private readonly settings: GoogleSettings,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args)
  ) {}

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.settings.clientId,
      redirect_uri: this.settings.redirectUri,
      response_type: 'code',
      scope: DRIVE_SCOPE,
      access_type: 'offline',
      // Ask every time, so Google always returns a refresh token.
      prompt: 'consent',
      include_granted_scopes: 'false',
      state,
    });
    return `${AUTH_URL}?${params}`;
  }

  private async token(body: Record<string, string>) {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.settings.clientId,
        client_secret: this.settings.clientSecret,
        ...body,
      }),
    });
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };
    if (!response.ok || !data.access_token) {
      throw new GoogleError(
        `token request failed: ${data.error ?? response.status}`,
        response.status
      );
    }
    return data;
  }

  async exchangeCode(code: string) {
    const data = await this.token({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.settings.redirectUri,
    });
    if (!data.refresh_token) throw new GoogleError('no refresh token returned', 400);
    return { refreshToken: data.refresh_token, accessToken: data.access_token! };
  }

  async accessToken(refreshToken: string) {
    return (
      await this.token({ refresh_token: refreshToken, grant_type: 'refresh_token' })
    ).access_token!;
  }

  async file(accessToken: string, fileId: string): Promise<DriveFile> {
    const response = await this.fetchImpl(
      `${FILES_URL}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) throw new GoogleError('file not accessible', response.status);
    const data = (await response.json()) as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
    };
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      size: Number(data.size ?? 0),
    };
  }

  async download(accessToken: string, fileId: string) {
    const response = await this.fetchImpl(
      `${FILES_URL}/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok || !response.body) {
      throw new GoogleError('download failed', response.status);
    }
    return response;
  }

  async revoke(token: string) {
    await this.fetchImpl(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
      }
    );
  }
}
