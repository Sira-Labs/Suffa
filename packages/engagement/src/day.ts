/**
 * Calendar days in the learner's time zone (ADR-0016): a day ends at local midnight, not at
 * UTC midnight. Days are `YYYY-MM-DD` strings, so they compare and sort as text.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Is this an IANA time zone the runtime knows (e.g. "Europe/Zurich")? */
export function isTimeZone(value: string): boolean {
  try {
    formatter(value);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function parts(at: Date | string, timeZone: string): Record<string, string> {
  const date = typeof at === 'string' ? new Date(at) : at;
  return Object.fromEntries(
    formatter(timeZone)
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
}

/** The local day of an instant, e.g. 2026-09-24T22:30Z in Europe/Zurich → "2026-09-25". */
export function dayKey(at: Date | string, timeZone: string): string {
  const p = parts(at, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The local hour (0–23) of an instant. */
export function localHour(at: Date | string, timeZone: string): number {
  return Number(parts(at, timeZone).hour);
}

/** `day` shifted by `n` calendar days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendar days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000
  );
}

/** Monday of the week `day` belongs to (German week start). */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}
