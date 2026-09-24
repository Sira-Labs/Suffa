import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ExamResult } from '@/types';
import { Badges } from '@/modules/engagement/Badges';
import { db } from '@/services/storage';
import {
  useCheckInStore,
  useEngagementStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
} from '@/state';

const perfect: ExamResult = {
  id: 'exam-1',
  format: 'vocab_ar_de',
  units: [1],
  score: 10,
  total: 10,
  items: [],
  startedAt: '2026-09-20T10:00:00.000Z',
  finishedAt: '2026-09-20T10:05:00.000Z',
  updated_at: '2026-09-20T10:05:00.000Z',
  deleted: false,
};

/** Story 5.3: the gallery shows every badge, what is reached and the way to the next tier. */
describe('Badge gallery (integration)', () => {
  beforeEach(async () => {
    await Promise.all([
      db.review_logs.clear(),
      db.exam_results.clear(),
      db.practice_progress.clear(),
    ]);
    await db.exam_results.add(perfect);
    await useEnrollmentStore.getState().load();
    await useListenStore.getState().load();
    await usePracticeStore.getState().load();
    await useCheckInStore.getState().load();
    await useEngagementStore.getState().refresh();
  });

  it('shows reached tiers and progress towards the next', async () => {
    const router = createMemoryRouter([{ path: '/', element: <Badges /> }]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Abzeichen' })).toBeInTheDocument();
    const najm = screen.getByText('Najm al-Imtiḥān').closest('li')!;
    expect(within(najm).getByText(/Bronze · 1/).textContent).toContain('erreicht');
    expect(within(najm).getByText(/1 von 5/)).toBeInTheDocument();
    const streak = screen.getByText('al-Mudāwim').closest('li')!;
    expect(within(streak).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '7');
  });
});
