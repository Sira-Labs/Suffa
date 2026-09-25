/**
 * Client for the admin AI page (story 9.5): routes per task, budget and quotas, spend, and a
 * test call. Amounts come from the server in micro-dollars.
 */
import { apiRequest, type Fetch } from '@/services/api/request';

export type ProviderId = 'anthropic' | 'openrouter' | 'huggingface';
export type Capability = 'tools' | 'structuredOutput' | 'vision' | 'streaming';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiRoute {
  task: string;
  position: number;
  provider: ProviderId;
  model: string;
  effort: Effort | null;
  maxTokens: number;
  capabilities: Capability[];
  premium: boolean;
  enabled: boolean;
  price: { input: number; output: number } | null;
}

export type RouteDraft = Omit<AiRoute, 'task' | 'position'>;

export interface AiSettings {
  monthlyBudgetMicro: number;
  downgradePercent: number;
  dailyTurns: { student: number | null; teacher: number | null; admin: number | null };
}

export interface AiBudget {
  mode: 'normal' | 'economy' | 'exhausted';
  spentMicro: number;
  budgetMicro: number;
}

export interface TaskUsage {
  task: string;
  model: string | null;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costMicro: number;
}

export interface AiOverview {
  providers: ProviderId[];
  routes: AiRoute[];
  settings: AiSettings;
  budget: AiBudget;
  usage: TaskUsage[];
}

export interface TryResult {
  text: string;
  provider: ProviderId;
  model: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  costMicroUsd: number | null;
  latencyMs: number;
  attempts: Array<{ provider: ProviderId; model: string; outcome: string }>;
}

const MESSAGES: Record<string, string> = {
  second_factor_required: 'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
  invalid_body: 'Bitte prüfe die Eingaben.',
  ai_paused: 'Das KI-Budget dieses Monats ist aufgebraucht – KI macht Pause.',
  ai_unavailable: 'Kein Modell hat geantwortet. Sind die Schlüssel gesetzt?',
  ai_quota: 'Das Tageskontingent ist aufgebraucht.',
  ai_bad_request: 'Das Modell hat die Anfrage abgelehnt (ungültige Anfrage).',
};

export const TASK_LABELS: Record<string, string> = {
  'tutor.converse': 'Gespräch mit al-Muʿallim',
  'tutor.explain': 'Erklärungen',
  'grade.writing': 'Schreiben bewerten',
  'grade.speech': 'Aussprache bewerten',
  'exercise.generate': 'Übungen erzeugen',
  'tutor.coach': 'Wochenplan',
  'content.author-assist': 'Autorenhilfe',
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
};

/** "$1.23" from micro-dollars; small amounts keep more digits. */
export function formatUsd(micro: number): string {
  const usd = micro / 1_000_000;
  return `$${usd.toFixed(usd > 0 && usd < 0.1 ? 4 : 2)}`;
}

export class AiAdminApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  overview() {
    return this.call<AiOverview>('/api/v1/admin/ai');
  }

  saveRoutes(task: string, routes: RouteDraft[]) {
    return this.call<void>(`/api/v1/admin/ai/routes/${encodeURIComponent(task)}`, {
      method: 'PUT',
      body: JSON.stringify({ routes }),
    });
  }

  saveSettings(settings: {
    monthlyBudgetUsd: number;
    downgradePercent: number;
    dailyTurns: AiSettings['dailyTurns'];
  }) {
    return this.call<void>('/api/v1/admin/ai/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  tryRoute(task: string, prompt: string) {
    return this.call<TryResult>('/api/v1/admin/ai/try', {
      method: 'POST',
      body: JSON.stringify({ task, prompt }),
    });
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}
