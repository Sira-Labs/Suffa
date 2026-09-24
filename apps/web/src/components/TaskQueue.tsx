import { useState, type ReactNode } from 'react';

/**
 * Works through the open tasks in order. A solved task never comes back; skipping moves on to
 * the next open one (and comes round again later). When nothing is open, `complete` shows.
 */
export function TaskQueue({
  ids,
  isDone,
  complete,
  children,
}: {
  ids: readonly string[];
  isDone(id: string): boolean;
  complete: ReactNode;
  children(id: string, position: string, next: () => void): ReactNode;
}) {
  const [current, setCurrent] = useState<string | null>(
    () => ids.find((id) => !isDone(id)) ?? null
  );
  const open = ids.filter((id) => !isDone(id));
  if (current === null || (open.length === 0 && isDone(current))) return <>{complete}</>;

  const next = () => {
    const start = ids.indexOf(current);
    for (let k = 1; k <= ids.length; k++) {
      const candidate = ids[(start + k) % ids.length]!;
      if (candidate !== current && !isDone(candidate)) {
        setCurrent(candidate);
        return;
      }
    }
    setCurrent(isDone(current) ? null : current);
  };
  return <>{children(current, `noch ${open.length} offen`, next)}</>;
}
