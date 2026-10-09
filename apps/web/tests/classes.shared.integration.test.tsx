import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassMembers } from '@/modules/classes/ClassMembers';
import { MySharedRecordings } from '@/modules/classes/MySharedRecordings';
import { SharedRecordingsList } from '@/modules/classes/SharedRecordingsList';
import { ShareRecording } from '@/modules/speaking/ShareRecording';
import { ClassesApi, type ClassSummary } from '@/services/classes/classesApi';
import { SharingApi, type ClassSharedRecording } from '@/services/sharing/sharingApi';

/** Story 15.4: sharing recordings with the class teacher. */
const CLASS_ID = '00000000-0000-4000-8000-0000000000c1';
const recording = {
  blob: new Blob([new Uint8Array(2048)], { type: 'audio/mp4' }),
  mimeType: 'audio/mp4',
};
const shared: ClassSharedRecording = {
  id: 'r1',
  classId: CLASS_ID,
  className: 'Arabisch 1a',
  text: 'السَّلامُ عَلَيْكُمْ.',
  score: 0.82,
  comment: null,
  commentedAt: null,
  heardAt: null,
  createdAt: '2026-10-09T18:00:00.000Z',
  url: '/media/suffa-uploads/shared/r1.m4a?sig',
  learner: { id: 'u1', name: 'Amina', email: 'amina@example.org' },
};

afterEach(() => vi.restoreAllMocks());

describe('Sharing a recording (learner)', () => {
  it('shares the recording just made, with its score, after one tap', async () => {
    const api = new SharingApi();
    const share = vi
      .spyOn(api, 'share')
      .mockResolvedValue({ ok: true, value: { id: 'r1' } });
    render(
      <ShareRecording
        api={api}
        targets={[{ classId: CLASS_ID, name: 'Arabisch 1a', allowed: true }]}
        text="مَرْحَبًا"
        recording={recording}
        score={0.9}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Mit Lehrkraft von Arabisch 1a teilen/ })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/geteilt/);
    expect(share).toHaveBeenCalledWith({
      classId: CLASS_ID,
      text: 'مَرْحَبًا',
      recording,
      score: 0.9,
    });
  });

  it('lets the learner pick the class and shows why sharing failed', async () => {
    const api = new SharingApi();
    const share = vi.spyOn(api, 'share').mockResolvedValue({
      ok: false,
      status: 409,
      code: 'too_many',
      message: 'Du hast schon sehr viele Aufnahmen geteilt.',
    });
    render(
      <ShareRecording
        api={api}
        targets={[
          { classId: 'a', name: 'Arabisch 1a', allowed: true },
          { classId: 'b', name: 'AG Koran', allowed: true },
          { classId: 'c', name: 'Kinderkurs', allowed: false },
        ]}
        text="مَرْحَبًا"
        recording={recording}
        score={null}
      />
    );
    const select = screen.getByLabelText('Klasse');
    // Classes still waiting for the parents' consent are not offered.
    expect(within(select).queryByText('Kinderkurs')).toBeNull();
    await userEvent.selectOptions(select, 'b');
    await userEvent.click(screen.getByRole('button', { name: /Mit Lehrkraft teilen/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sehr viele/);
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'b', score: null })
    );
  });

  it('explains that a class of minors waits for the parents’ consent', () => {
    render(
      <ShareRecording
        api={new SharingApi()}
        targets={[{ classId: 'c', name: 'Kinderkurs', allowed: false }]}
        text="مَرْحَبًا"
        recording={recording}
        score={null}
      />
    );
    expect(screen.getByText(/Einverständnis deiner Eltern/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing to someone without a class', () => {
    const { container } = render(
      <ShareRecording
        api={new SharingApi()}
        targets={[]}
        text="مَرْحَبًا"
        recording={recording}
        score={null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists what was shared with the teacher’s comment and withdraws it', async () => {
    const api = new SharingApi();
    const mine = vi.spyOn(api, 'mine').mockResolvedValue({
      ok: true,
      value: {
        targets: [],
        items: [
          { ...shared, comment: 'Schön! Das ع noch tiefer.', heardAt: shared.createdAt },
          { ...shared, id: 'other', classId: 'another-class' },
        ],
      },
    });
    const withdraw = vi
      .spyOn(api, 'withdraw')
      .mockResolvedValue({ ok: true, value: undefined });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MySharedRecordings api={api} classId={CLASS_ID} />);

    const item = await screen.findByRole('article', { name: 'Geteilte Aufnahme' });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(item).toHaveTextContent('Schön! Das ع noch tiefer.');
    expect(item).toHaveTextContent('von der Lehrkraft gehört');

    mine.mockResolvedValue({ ok: true, value: { targets: [], items: [] } });
    await userEvent.click(within(item).getByRole('button', { name: 'Zurückziehen' }));
    expect(withdraw).toHaveBeenCalledWith('r1');
    expect(await screen.findByText(/jederzeit zurückziehen/)).toBeInTheDocument();
  });
});

describe('Listening list (teacher)', () => {
  it('plays a recording (marking it heard) and saves a comment', async () => {
    const api = new SharingApi();
    vi.spyOn(api, 'forClass').mockResolvedValue({ ok: true, value: { items: [shared] } });
    const review = vi
      .spyOn(api, 'review')
      .mockResolvedValue({ ok: true, value: undefined });
    render(<SharedRecordingsList api={api} classId={CLASS_ID} />);

    const item = await screen.findByRole('article', { name: 'Aufnahme von Amina' });
    expect(screen.getByRole('heading', { name: /Hörliste/ })).toHaveTextContent('1 neu');
    expect(item).toHaveTextContent('82 % erkannt');
    fireEvent.play(item.querySelector('audio')!);
    await waitFor(() =>
      expect(review).toHaveBeenCalledWith(CLASS_ID, 'r1', { heard: true })
    );

    const save = within(item).getByRole('button', { name: 'Kommentar speichern' });
    expect(save).toBeDisabled();
    await userEvent.type(within(item).getByRole('textbox'), ' Gut gemacht! ');
    await userEvent.click(save);
    expect(review).toHaveBeenLastCalledWith(CLASS_ID, 'r1', {
      comment: 'Gut gemacht!',
      heard: true,
    });
  });

  it('says how learners share when nothing came in yet', async () => {
    const api = new SharingApi();
    vi.spyOn(api, 'forClass').mockResolvedValue({ ok: true, value: { items: [] } });
    render(<SharedRecordingsList api={api} classId={CLASS_ID} />);
    expect(await screen.findByText(/Noch nichts geteilt/)).toBeInTheDocument();
  });
});

describe('Parents’ consent (teacher, class of minors)', () => {
  const summary: ClassSummary = {
    id: CLASS_ID,
    name: 'Kinderkurs',
    classRole: 'teacher',
    status: 'active',
    studentCount: 1,
    pendingCount: 0,
    minors: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  };

  it('records and revokes the consent per learner', async () => {
    const amina = (parentalConsent: boolean) => ({
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
            parentalConsent,
          },
        ],
      },
    });
    const classes = new ClassesApi();
    // Before the click without consent, after it (reloaded) with.
    vi.spyOn(classes, 'members')
      .mockResolvedValueOnce(amina(false))
      .mockResolvedValue(amina(true));
    const sharing = new SharingApi();
    const setConsent = vi
      .spyOn(sharing, 'setConsent')
      .mockResolvedValue({ ok: true, value: undefined });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <MemoryRouter>
        <ClassMembers
          api={classes}
          sharing={sharing}
          summary={summary}
          onChange={async () => {}}
        />
      </MemoryRouter>
    );
    const box = await screen.findByRole('checkbox', {
      name: 'Einverständnis der Eltern',
    });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(setConsent).toHaveBeenCalledWith(CLASS_ID, 'u1', true);
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Einverständnis der Eltern' })
      ).toBeChecked()
    );
    // Revoking deletes what the child shared: it asks first, and a "no" changes nothing.
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Einverständnis der Eltern' })
    );
    expect(confirm).toHaveBeenCalled();
    expect(setConsent).toHaveBeenCalledTimes(1);
  });

  it('shows no consent box in a class of adults', async () => {
    const classes = new ClassesApi();
    vi.spyOn(classes, 'members').mockResolvedValue({
      ok: true,
      value: {
        members: [
          {
            userId: 'u1',
            email: 'amina@example.org',
            name: 'Amina',
            classRole: 'student',
            status: 'active',
            joinedAt: '2026-09-02T00:00:00.000Z',
            parentalConsent: false,
          },
        ],
      },
    });
    render(
      <MemoryRouter>
        <ClassMembers
          api={classes}
          sharing={new SharingApi()}
          summary={{ ...summary, minors: false }}
          onChange={async () => {}}
        />
      </MemoryRouter>
    );
    expect(await screen.findByText('Amina')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
