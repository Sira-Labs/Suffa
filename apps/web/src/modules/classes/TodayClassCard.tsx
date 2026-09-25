/**
 * On "Heute" (story 6.2): the weekly challenge of the learner's class, with the newest
 * shout-out to them. Needs the server; offline or without a class it shows nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClassesApi, type ClassFeed } from '@/services/classes/classesApi';
import { InteractiveApi, type Assignment } from '@/services/media/interactiveApi';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';
import { OpenAssignments } from './Assignments';
import { ChallengeCard } from './ClassLife';

export function TodayClassCard() {
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const api = useMemo(() => new ClassesApi(), []);
  const [state, setState] = useState<{
    id: string;
    feed: ClassFeed;
    assignments: Assignment[];
  } | null>(null);
  const online = provider instanceof ApiSyncProvider && auth.status === 'signed-in';

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void (async () => {
      const list = await api.list();
      const mine = list.ok
        ? list.value.classes.find(
            (c) => c.classRole === 'student' && c.status === 'active'
          )
        : undefined;
      if (!mine) return;
      const [feed, assignments] = await Promise.all([
        api.feed(mine.id),
        new InteractiveApi().assignments(mine.id),
      ]);
      if (!cancelled && feed.ok) {
        setState({
          id: mine.id,
          feed: feed.value,
          assignments: assignments.ok ? assignments.value.assignments : [],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Refreshed after each sync: the challenge counts synced progress.
  }, [api, online, lastSyncAt]);

  if (!online || !state) return null;
  const shout = state.feed.shoutouts.find((s) => s.toYou);
  return (
    <>
      <OpenAssignments classId={state.id} items={state.assignments} />
      {state.feed.challenge && (
        <Link
          to={`/classes/${state.id}`}
          className="class-link stack"
          style={{ gap: '0.5rem' }}
        >
          <ChallengeCard challenge={state.feed.challenge} />
          {shout && (
            <p className="feed-item feed-item-you" style={{ margin: 0 }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {shout.author ?? 'Deine Lehrkraft'} an dich:{' '}
              </span>
              {shout.message}
            </p>
          )}
        </Link>
      )}
    </>
  );
}
