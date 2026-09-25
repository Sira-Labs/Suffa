/** A fetch stand-in that replays scripted responses and records every request. */
export interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export type Script = Response | Error | (() => Response | Error);

export function fakeFetch(scripts: Script[]) {
  const requests: Recorded[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    requests.push({
      url,
      headers,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    if (init?.signal?.aborted)
      throw init.signal.reason ?? new DOMException('aborted', 'AbortError');
    const next = scripts.shift();
    if (!next) throw new Error('no scripted response left');
    const value = typeof next === 'function' ? next() : next;
    if (value instanceof Error) throw value;
    return value;
  }) as typeof fetch;
  return { fetch: impl, requests };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function sse(events: Array<{ event?: string; data: unknown }>): Response {
  const text = events
    .map(
      (e) =>
        `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`
    )
    .join('');
  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}
