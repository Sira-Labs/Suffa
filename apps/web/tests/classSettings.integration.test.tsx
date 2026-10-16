import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Training } from '@/modules/more';
import { AreaGate } from '@/modules/classes/areaAccess';
import { ClassSettings } from '@/modules/classes/ClassSettings';
import { ClassContextSync } from '@/modules/classes/ClassContextSync';
import { ClassesApi, type ClassSummary } from '@/services/classes/classesApi';
import {
  primaryClass,
  readStored,
  useClassContextStore,
  useEnrollmentStore,
  useSyncStore,
} from '@/state';
import { PALETTES } from '@/theme/palettes';
import { applyDocumentSettings, useSettingsStore } from '@/state/settingsStore';

/** Stories 18.1/18.2: the teacher's colours and area unlocks, as learners see them. */
const role = vi.hoisted(() => ({ current: 'learner' as string | null }));
vi.mock('@/modules/account/useRole', () => ({ useRole: () => role.current }));

const summary = (over: Partial<ClassSummary> = {}): ClassSummary => ({
  id: 'c1',
  name: 'Arabisch 1a',
  course: 'bayna-yadayk',
  classRole: 'teacher',
  status: 'active',
  studentCount: 3,
  pendingCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  joinedAt: '2026-09-01T00:00:00.000Z',
  palette: 'oase',
  unlocks: {},
  ...over,
});

function renderPage(element: React.ReactElement) {
  const router = createMemoryRouter([
    { path: '/', element },
    { path: '/training', element: <p>Üben</p> },
  ]);
  render(<RouterProvider router={router} />);
}

const exam = (unit: number) => ({
  id: `e${unit}`,
  format: 'unit_test',
  units: [unit],
  score: 10,
  total: 10,
  items: [],
  startedAt: '2026-10-01T10:00:00.000Z',
  finishedAt: '2026-10-01T10:10:00.000Z',
  updated_at: '2026-10-01T10:10:00.000Z',
  deleted: false,
});

beforeEach(() => {
  role.current = 'learner';
  useClassContextStore.setState({ context: null });
  useEnrollmentStore.setState({ exams: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useClassContextStore.setState({ context: null });
});

describe('practice areas', () => {
  it('opens roots once the learner reached unit 3', () => {
    renderPage(<AreaGate area="roots">Wurzel-Seite</AreaGate>);
    expect(screen.getByRole('status').textContent).toContain('Einheit 3');
    expect(screen.queryByText('Wurzel-Seite')).toBeNull();
  });

  it('follows the class: closed by the teacher, or open at once', () => {
    useEnrollmentStore.setState({ exams: [exam(1), exam(2)] as never });
    useClassContextStore.setState({
      context: {
        classId: 'c1',
        course: 'bayna-yadayk',
        palette: 'oase',
        unlocks: { exam: { mode: 'closed' }, roots: { mode: 'open' } },
      },
    });
    renderPage(<Training />);
    const list = screen.getByRole('list', { name: 'Trainingsbereiche' });
    expect(within(list).getByRole('link', { name: /Wurzeln/ })).toBeTruthy();
    expect(within(list).queryByRole('link', { name: /Prüfung/ })).toBeNull();
    expect(
      within(list).getByText('Deine Lehrkraft schaltet diesen Bereich noch frei.')
    ).toBeTruthy();
  });

  it('shows teachers every area', () => {
    role.current = 'teacher';
    useClassContextStore.setState({
      context: {
        classId: 'c1',
        course: 'bayna-yadayk',
        palette: 'oase',
        unlocks: { roots: { mode: 'closed' } },
      },
    });
    renderPage(<AreaGate area="roots">Wurzel-Seite</AreaGate>);
    expect(screen.getByText('Wurzel-Seite')).toBeTruthy();
  });
});

describe('class context', () => {
  it('takes the active class joined last', () => {
    const older = summary({ id: 'a', joinedAt: '2026-09-01T00:00:00.000Z' });
    const newer = summary({ id: 'b', joinedAt: '2026-10-01T00:00:00.000Z' });
    const pending = summary({
      id: 'c',
      status: 'pending',
      joinedAt: '2026-10-09T00:00:00Z',
    });
    expect(primaryClass([older, newer, pending])?.id).toBe('b');
    expect(primaryClass([pending])).toBeNull();
  });

  it('uses only well-formed settings remembered on the device', () => {
    const remember = (value: unknown) =>
      localStorage.setItem('suffa.classContext', JSON.stringify(value));
    const good = {
      classId: 'c1',
      course: 'madinah',
      palette: 'sand',
      unlocks: { roots: { mode: 'unit', unit: 2 } },
    };
    remember(good);
    expect(readStored()).toEqual(good);
    for (const bad of [
      { ...good, course: 'klingon' },
      { ...good, palette: 'neon' },
      { ...good, unlocks: { roots: { mode: 'unit' } } },
      { ...good, unlocks: { tutor: { mode: 'open' } } },
      { ...good, unlocks: 'open' },
    ]) {
      remember(bad);
      expect(readStored(), JSON.stringify(bad)).toBeNull();
    }
    localStorage.setItem('suffa.classContext', '{not json');
    expect(readStored()).toBeNull();
    localStorage.removeItem('suffa.classContext');
  });

  it('styles the app with the class colours unless the learner picked their own', () => {
    const root = document.documentElement;
    useClassContextStore.getState().setClasses([summary({ palette: 'meer' })]);
    applyDocumentSettings({ ...useSettingsStore.getState().settings, theme: 'light' });
    expect(root.style.getPropertyValue('--bg')).toBe(PALETTES.meer.light.bg);
    applyDocumentSettings({
      ...useSettingsStore.getState().settings,
      theme: 'light',
      palette: 'sand',
    });
    expect(root.style.getPropertyValue('--bg')).toBe(PALETTES.sand.light.bg);
    useClassContextStore.getState().setClasses([]);
    applyDocumentSettings({ ...useSettingsStore.getState().settings, palette: 'class' });
    expect(root.style.getPropertyValue('--bg')).toBe('');
  });
});

describe('class settings (teacher)', () => {
  it('saves the colour scheme and when the areas open', async () => {
    const api = new ClassesApi();
    const update = vi
      .spyOn(api, 'updateSettings')
      .mockResolvedValue({ ok: true, value: undefined });
    const onChange = vi.fn(async () => {});
    render(<ClassSettings api={api} summary={summary()} onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: /Meer/ }));
    expect(update).toHaveBeenLastCalledWith('c1', { palette: 'meer' });

    // Roots start at the default (unit 3); the teacher moves them to unit 5 and closes the exam.
    const unit = screen.getByRole('spinbutton', { name: 'Ab Einheit für Wurzeln' });
    expect(unit).toHaveValue(3);
    await userEvent.clear(unit);
    await userEvent.type(unit, '5');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Wann öffnet sich Prüfung?' }),
      'closed'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Freischaltung speichern' })
    );
    expect(update).toHaveBeenLastCalledWith(
      'c1',
      expect.objectContaining({
        unlocks: expect.objectContaining({
          roots: { mode: 'unit', unit: 5 },
          exam: { mode: 'closed' },
          vocab: { mode: 'open' },
        }),
      })
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toContain('Gespeichert');

    // Back to the defaults: not saved yet, so the "saved" note goes away.
    await userEvent.click(screen.getByRole('button', { name: 'Voreinstellung' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.getByRole('spinbutton', { name: 'Ab Einheit für Wurzeln' })
    ).toHaveValue(3);
  });

  it('saves quick colour picks in the order they were made', async () => {
    const api = new ClassesApi();
    const order: string[] = [];
    let release: () => void = () => undefined;
    vi.spyOn(api, 'updateSettings').mockImplementation(async (_id, patch) => {
      // The first save is slow: the second must still wait for it.
      if (patch.palette === 'meer') await new Promise<void>((done) => (release = done));
      order.push(String(patch.palette));
      return { ok: true, value: undefined };
    });
    render(<ClassSettings api={api} summary={summary()} onChange={async () => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: /Meer/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Sand/ }));
    expect(order).toEqual([]);
    release();
    await waitFor(() => expect(order).toEqual(['meer', 'sand']));
  });
});

describe('remembered class', () => {
  const context = {
    classId: 'c1',
    course: 'bayna-yadayk' as const,
    palette: 'meer' as const,
    unlocks: { exam: { mode: 'closed' as const } },
  };
  const original = useSyncStore.getState().auth;
  afterEach(() => useSyncStore.setState({ auth: original }));

  it('keeps it while the app starts or stays offline, signed out', () => {
    useSyncStore.setState({ auth: { status: 'signed-out' } });
    useClassContextStore.setState({ context });
    render(<ClassContextSync />);
    expect(useClassContextStore.getState().context).toEqual(context);
  });

  it('forgets it when the user signs out', async () => {
    useSyncStore.setState({
      auth: { status: 'signed-in', user: { id: 'u1', email: 'a@example.org' } },
    } as never);
    useClassContextStore.setState({ context });
    render(<ClassContextSync />);
    expect(useClassContextStore.getState().context).toEqual(context);
    useSyncStore.setState({ auth: { status: 'signed-out' } });
    await waitFor(() => expect(useClassContextStore.getState().context).toBeNull());
  });
});
