/**
 * Sync-Reconciliation: Konfliktlösung per Last-Write-Wins (LWW) je Datensatz.
 *
 * ADR-0002: Wir vergleichen `updated_at` (ISO-Zeitstempel). Der jüngere Datensatz
 * gewinnt – ganzer Datensatz, kein Feld-Merge. Begründung: einfache, vorhersagbare
 * Semantik; Lerndaten sind kleinteilig und selten echt gleichzeitig auf zwei
 * Geräten editiert. Soft-Deletes (`deleted: true`) nehmen als normaler Datensatz
 * am LWW teil – eine spätere Bearbeitung kann eine ältere Löschung also überstimmen.
 *
 * Diese Funktionen sind rein (kein I/O), damit sie deterministisch testbar sind.
 */

export interface Reconcilable {
  id: string;
  updated_at: string;
  deleted: boolean;
}

export type ReconcileDecision = 'keep-local' | 'take-remote' | 'equal';

/** Vergleicht zwei Versionen desselben Datensatzes. */
export function decide<T extends Reconcilable>(
  local: T | undefined,
  remote: T | undefined
): ReconcileDecision {
  if (local && !remote) return 'keep-local';
  if (!local && remote) return 'take-remote';
  if (!local && !remote) return 'equal';

  const l = local as T;
  const r = remote as T;
  const lt = Date.parse(l.updated_at);
  const rt = Date.parse(r.updated_at);

  if (Number.isNaN(lt) && Number.isNaN(rt)) return 'equal';
  if (Number.isNaN(lt)) return 'take-remote';
  if (Number.isNaN(rt)) return 'keep-local';

  if (rt > lt) return 'take-remote';
  if (lt > rt) return 'keep-local';
  return 'equal';
}

export interface MergeResult<T> {
  /** Vollständig gemergte Menge (für Persistenz). */
  merged: T[];
  /** Datensätze, die lokal aktualisiert/übernommen werden müssen. */
  toWriteLocal: T[];
  /** Lokale Datensätze, die (noch) ans Backend müssen, weil sie neuer sind. */
  toPushRemote: T[];
}

/**
 * Führt lokale und entfernte Datensätze per LWW zusammen.
 *
 * @param locals  aktueller lokaler Stand
 * @param remotes vom Backend gezogene Datensätze
 */
export function mergeRecords<T extends Reconcilable>(
  locals: T[],
  remotes: T[]
): MergeResult<T> {
  const localMap = new Map(locals.map((r) => [r.id, r]));
  const remoteMap = new Map(remotes.map((r) => [r.id, r]));
  const ids = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

  const merged: T[] = [];
  const toWriteLocal: T[] = [];
  const toPushRemote: T[] = [];

  for (const id of ids) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    const decision = decide(local, remote);

    switch (decision) {
      case 'keep-local': {
        const winner = local as T;
        merged.push(winner);
        // Lokal neuer als (oder ohne) Remote → muss noch gepusht werden.
        toPushRemote.push(winner);
        break;
      }
      case 'take-remote': {
        const winner = remote as T;
        merged.push(winner);
        toWriteLocal.push(winner);
        break;
      }
      case 'equal': {
        const winner = (local ?? remote) as T;
        merged.push(winner);
        break;
      }
    }
  }

  return { merged, toWriteLocal, toPushRemote };
}
