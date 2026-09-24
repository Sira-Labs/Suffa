/** GDPR self-service (story 4.4): download everything stored about you; delete the account. */
import { apiRequest, type Fetch } from '@/services/api/request';

const MESSAGES: Record<string, string> = {
  confirmation_mismatch: 'Die E-Mail-Adresse stimmt nicht mit deinem Konto überein.',
};

export class PrivacyApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  /** The export as pretty-printed JSON with a file name, ready to save. */
  async exportFile(): Promise<
    { ok: true; json: string; name: string } | { ok: false; message: string }
  > {
    const result = await apiRequest<unknown>(this.fetchImpl, '/api/v1/account/export');
    if (!result.ok) return { ok: false, message: result.message };
    const day = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      json: JSON.stringify(result.value, null, 2),
      name: `suffa-export-${day}.json`,
    };
  }

  deleteAccount(confirmEmail: string) {
    return apiRequest<void>(
      this.fetchImpl,
      '/api/v1/account',
      { method: 'DELETE', body: JSON.stringify({ confirm: confirmEmail }) },
      MESSAGES
    );
  }
}
