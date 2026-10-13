import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassMembers } from '@/modules/classes/ClassMembers';
import {
  ClassesApi,
  type ClassSection,
  type ClassSummary,
} from '@/services/classes/classesApi';

/** ADR-0026, stage 2: the teacher puts learners with the sisters or the brothers. */
const CLASS_ID = '00000000-0000-4000-8000-0000000000c2';
const summary: ClassSummary = {
  id: CLASS_ID,
  name: 'Arabisch 1a',
  classRole: 'teacher',
  status: 'active',
  studentCount: 1,
  pendingCount: 0,
  minors: false,
  createdAt: '2026-09-01T00:00:00.000Z',
};

const members = (section: ClassSection | null) => ({
  ok: true as const,
  value: {
    members: [
      {
        userId: 'u1',
        email: 'amina@example.org',
        name: 'Amina',
        classRole: 'student' as const,
        status: 'active' as const,
        joinedAt: '2026-09-02T00:00:00.000Z',
        section,
      },
    ],
  },
});

afterEach(() => vi.restoreAllMocks());

describe('Sections of a class (teacher)', () => {
  it('puts a learner with the sisters and back to no section', async () => {
    const classes = new ClassesApi();
    vi.spyOn(classes, 'members')
      .mockResolvedValueOnce(members(null))
      .mockResolvedValueOnce(members('sisters'))
      .mockResolvedValue(members(null));
    const setSection = vi
      .spyOn(classes, 'setSection')
      .mockResolvedValue({ ok: true, value: undefined });
    render(
      <MemoryRouter>
        <ClassMembers api={classes} summary={summary} onChange={async () => {}} />
      </MemoryRouter>
    );

    const select = await screen.findByRole('combobox', { name: 'Bereich von Amina' });
    expect(select).toHaveValue('');
    await userEvent.selectOptions(select, 'Schwestern');
    expect(setSection).toHaveBeenCalledWith(CLASS_ID, 'u1', 'sisters');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Bereich von Amina' })).toHaveValue(
        'sisters'
      )
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Bereich von Amina' }),
      'Kein Bereich'
    );
    expect(setSection).toHaveBeenLastCalledWith(CLASS_ID, 'u1', null);
  });

  it('sends the section to the server', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await new ClassesApi(fetchImpl).setSection(CLASS_ID, 'u1', 'brothers');
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/v1/classes/${CLASS_ID}/members/u1/section`,
      expect.objectContaining({ method: 'PUT', body: '{"section":"brothers"}' })
    );
  });
});
