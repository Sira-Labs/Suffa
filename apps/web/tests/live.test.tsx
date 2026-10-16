/**
 * Live lessons (ADR-0026) in the web app: the teacher plans and starts a session, learners
 * see the banner, and the room: the teacher on the stage, raised hands, giving the floor, chat
 * and leaving. LiveKit is replaced by a fake connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  LiveBanner,
  LiveSessionsTeacher,
  nextHourLocal,
} from '@/modules/live/LiveSessions';
import { LiveRoom } from '@/modules/live/LiveRoom';
import type { LiveSession } from '@/services/live/liveApi';
import type { BackgroundId } from '@/services/live/backgrounds';
import { BackgroundError } from '@/services/live/liveRoom';
import type {
  LiveConnection,
  LivePerson,
  LiveSource,
  LiveState,
} from '@/services/live/liveRoom';

const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

const session = (over: Partial<LiveSession> = {}): LiveSession => ({
  id: SESSION_ID,
  classId: CLASS_ID,
  title: 'Lektion 5',
  startsAt: '2026-10-13T16:00:00.000Z',
  durationMinutes: 60,
  status: 'scheduled',
  startedAt: null,
  endedAt: null,
  audience: 'all',
  learnerCameras: true,
  ...over,
});

/** A fake API server: sessions in memory, every request recorded. */
function server(
  initial: { enabled: boolean; sessions: LiveSession[] },
  role: 'teacher' | 'learner' = 'teacher'
) {
  const state = { ...initial, sessions: [...initial.sessions] };
  const requests: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, path, body });
      const base = `/api/v1/classes/${CLASS_ID}/live`;
      if (path === base && method === 'GET') return Response.json(state);
      if (path === base && method === 'POST') {
        const created = session({ id: crypto.randomUUID(), ...body });
        state.sessions.push(created);
        return Response.json({ session: created }, { status: 201 });
      }
      if (path === `${base}/${SESSION_ID}/start`) {
        state.sessions = state.sessions.map((s) => ({ ...s, status: 'live' as const }));
        return Response.json({ session: state.sessions[0] });
      }
      if (path === `${base}/${SESSION_ID}/join`) {
        return Response.json({
          url: 'wss://live.example.org',
          token: 'jwt',
          role,
          session: {
            ...(state.sessions.find((s) => s.id === SESSION_ID) ?? session()),
            status: 'live',
          },
        });
      }
      if (path === `${base}/${SESSION_ID}/floor`)
        return new Response(null, { status: 204 });
      if (path === `${base}/${SESSION_ID}/end`) {
        return Response.json({ session: session({ status: 'ended' }) });
      }
      return Response.json({ error: 'not_found' }, { status: 404 });
    })
  );
  return { requests };
}

const person = (over: Partial<LivePerson>): LivePerson => ({
  identity: 'x',
  name: 'x',
  role: 'learner',
  local: false,
  speaking: false,
  hand: false,
  floor: false,
  micOn: false,
  cameraOn: false,
  screenOn: false,
  cameraReady: false,
  screenReady: false,
  ...over,
});

/** A fake LiveKit connection the test drives. */
class FakeConnection implements LiveConnection {
  current: LiveState;
  listeners = new Set<(s: LiveState) => void>();
  calls: string[] = [];
  attached: { identity: string; source: LiveSource }[] = [];
  constructor(state: Partial<LiveState>) {
    this.current = {
      status: 'connected',
      ended: false,
      people: [],
      chat: [],
      canPublish: false,
      ...state,
    };
  }
  state() {
    return this.current;
  }
  subscribe(listener: (s: LiveState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  update(change: Partial<LiveState>) {
    this.current = { ...this.current, ...change };
    act(() => this.listeners.forEach((l) => l(this.current)));
  }
  async setMicrophone(on: boolean) {
    this.calls.push(`mic:${on}`);
  }
  async setCamera(on: boolean) {
    this.calls.push(`camera:${on}`);
  }
  async setScreenShare(on: boolean) {
    this.calls.push(`screen:${on}`);
  }
  async setBackground(id: BackgroundId) {
    this.calls.push(`background:${id}`);
  }
  async raiseHand(up: boolean) {
    this.calls.push(`hand:${up}`);
  }
  async send(text: string) {
    this.calls.push(`send:${text}`);
  }
  attach(identity: string, source: LiveSource) {
    this.attached.push({ identity, source });
    return () => undefined;
  }
  disconnect() {
    this.calls.push('disconnect');
  }
}

function renderAt(element: React.ReactElement, path: string, route: string) {
  const router = createMemoryRouter(
    [
      { path: route, element },
      { path: '/classes/:id', element: <p>Klassenseite</p> },
    ],
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('planning live lessons', () => {
  it('suggests the next full hour', () => {
    expect(nextHourLocal(new Date(2026, 9, 13, 15, 42))).toBe('2026-10-13T16:00');
  });

  it('lets the teacher plan a session and start it into the room', async () => {
    const { requests } = server({ enabled: true, sessions: [] });
    renderAt(
      <LiveSessionsTeacher classId={CLASS_ID} />,
      `/classes/${CLASS_ID}/tab`,
      '/classes/:id/tab'
    );
    expect(await screen.findByText('Noch kein Live-Unterricht geplant.')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Thema'), 'Lektion 5');
    await userEvent.click(screen.getByRole('button', { name: 'Planen' }));
    const create = requests.find((r) => r.method === 'POST');
    expect(create?.body).toMatchObject({
      title: 'Lektion 5',
      durationMinutes: 60,
      audience: 'all',
      learnerCameras: true,
    });
    expect(new Date((create!.body as { startsAt: string }).startsAt).getMinutes()).toBe(
      0
    );
    expect(await screen.findByText('Lektion 5')).toBeTruthy();
  });

  it('plans a sisters’ lesson with the learners’ cameras off', async () => {
    const { requests } = server({ enabled: true, sessions: [] });
    renderAt(
      <LiveSessionsTeacher classId={CLASS_ID} />,
      `/classes/${CLASS_ID}/tab`,
      '/classes/:id/tab'
    );
    await userEvent.type(await screen.findByLabelText('Thema'), 'Tajwid');
    await userEvent.selectOptions(screen.getByLabelText('Für'), 'Schwestern');
    await userEvent.click(screen.getByLabelText(/Kameras der Lernenden bleiben aus/));
    await userEvent.click(screen.getByRole('button', { name: 'Planen' }));
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      title: 'Tajwid',
      audience: 'sisters',
      learnerCameras: false,
    });
    const item = (await screen.findByText('Tajwid')).closest('li')!;
    expect(within(item as HTMLElement).getByText('Schwestern')).toBeTruthy();
    expect(
      within(item as HTMLElement).getByText('Kameras der Lernenden aus')
    ).toBeTruthy();
  });

  it('shows the teacher that live lessons are not set up', async () => {
    server({ enabled: false, sessions: [session()] });
    renderAt(
      <LiveSessionsTeacher classId={CLASS_ID} />,
      `/classes/${CLASS_ID}/tab`,
      '/classes/:id/tab'
    );
    expect(
      await screen.findByText(
        'Live-Unterricht ist auf diesem Server noch nicht eingerichtet.'
      )
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Starten' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('shows learners the live lesson to join, else the next one, else nothing', async () => {
    server({ enabled: true, sessions: [session({ status: 'live' })] });
    const live = renderAt(
      <LiveBanner classId={CLASS_ID} />,
      `/classes/${CLASS_ID}/x`,
      '/classes/:id/x'
    );
    const link = await screen.findByRole('link', { name: /Live-Unterricht läuft/ });
    expect(link.getAttribute('href')).toBe(`/classes/${CLASS_ID}/live/${SESSION_ID}`);
    live.unmount();

    server({ enabled: true, sessions: [session()] });
    const next = renderAt(
      <LiveBanner classId={CLASS_ID} />,
      `/classes/${CLASS_ID}/x`,
      '/classes/:id/x'
    );
    expect(await screen.findByText(/Nächster Live-Unterricht: Lektion 5/)).toBeTruthy();
    next.unmount();

    server({ enabled: false, sessions: [session({ status: 'live' })] });
    const { container } = renderAt(
      <LiveBanner classId={CLASS_ID} />,
      `/classes/${CLASS_ID}/x`,
      '/classes/:id/x'
    );
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});

describe('the live room', () => {
  const teacher = person({
    identity: 't',
    name: 'Ustadha Maryam',
    role: 'teacher',
    local: true,
    cameraOn: true,
    cameraReady: true,
  });
  const amina = person({ identity: 'a', name: 'Amina', hand: true });
  const yusuf = person({ identity: 'y', name: 'Yusuf' });

  const join = async (
    connection: FakeConnection,
    screenShare = true,
    backgrounds = false
  ) => {
    const connect = vi.fn(async () => connection);
    renderAt(
      <LiveRoom connect={connect} screenShare={screenShare} backgrounds={backgrounds} />,
      `/classes/${CLASS_ID}/live/${SESSION_ID}`,
      '/classes/:id/live/:session'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
    await screen.findByRole('heading', { name: 'Lektion 5' });
    return connect;
  };

  it('puts the teacher on the stage and lets them give the floor to a raised hand', async () => {
    const { requests } = server({ enabled: true, sessions: [] });
    const connection = new FakeConnection({
      people: [teacher, amina, yusuf],
      canPublish: true,
    });
    const connect = await join(connection);
    expect(connect).toHaveBeenCalledWith(
      'wss://live.example.org',
      'jwt',
      expect.anything()
    );
    expect(connection.attached).toEqual([{ identity: 't', source: 'camera' }]);
    expect(screen.getByText('3 im Raum')).toBeTruthy();

    const people = screen.getByRole('region', { name: '3 im Raum' });
    const hand = within(people).getByText('Amina').closest('li')!;
    await userEvent.click(
      within(hand as HTMLElement).getByRole('button', { name: 'Wort geben' })
    );
    expect(requests.find((r) => r.path.endsWith('/floor'))?.body).toEqual({
      identity: 'a',
      allowed: true,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Bildschirm teilen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mikrofon an' }));
    expect(connection.calls).toEqual(['screen:true', 'mic:true']);

    // The screen share takes the stage; the camera stays small in the corner.
    connection.update({
      people: [{ ...teacher, screenOn: true, screenReady: true }, amina, yusuf],
    });
    expect(connection.attached.slice(-2)).toEqual([
      { identity: 't', source: 'screen' },
      { identity: 't', source: 'camera' },
    ]);
  });

  it('lets a learner raise a hand, chat, and speak once given the floor', async () => {
    server({ enabled: true, sessions: [] }, 'learner');
    const me = person({ identity: 'a', name: 'Amina', local: true });
    const connection = new FakeConnection({
      people: [me, { ...teacher, local: false, cameraReady: false }],
      canPublish: false,
    });
    await join(connection);
    // The teacher's camera is announced before its picture arrives: shown once it is here.
    expect(connection.attached).toEqual([]);
    connection.update({ people: [me, { ...teacher, local: false, cameraReady: false }] });
    expect(connection.attached).toEqual([]);
    connection.update({ people: [me, { ...teacher, local: false }] });
    expect(connection.attached).toEqual([{ identity: 't', source: 'camera' }]);
    expect(screen.queryByRole('button', { name: 'Mikrofon an' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Für alle beenden' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Melden/ }));
    await userEvent.type(screen.getByLabelText('Nachricht'), 'سلام عليكم');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(connection.calls).toEqual(['hand:true', 'send:سلام عليكم']);

    connection.update({
      canPublish: true,
      people: [
        { ...me, floor: true, micOn: true },
        { ...teacher, local: false },
      ],
    });
    expect(await screen.findByText('Du hast das Wort.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mikrofon aus' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Melden/ })).toBeNull();
  });

  it('explains on iPhone and iPad that the screen cannot be shared', async () => {
    server({ enabled: true, sessions: [] });
    await join(new FakeConnection({ people: [teacher], canPublish: true }), false);
    expect(screen.queryByRole('button', { name: 'Bildschirm teilen' })).toBeNull();
    expect(
      screen.getByText(/Bildschirm teilen geht auf iPhone und iPad nicht/)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kamera aus' })).toBeTruthy();
  });

  it('gives a learner only the microphone when the cameras stay off', async () => {
    server(
      {
        enabled: true,
        sessions: [session({ audience: 'sisters', learnerCameras: false })],
      },
      'learner'
    );
    const me = person({ identity: 'a', name: 'Amina', local: true, floor: true });
    await join(
      new FakeConnection({ people: [me, { ...teacher, local: false }], canPublish: true })
    );
    expect(screen.getByText('Schwestern')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mikrofon an' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kamera an' })).toBeNull();
  });

  it('keeps the teacher’s camera small beside the shared screen, and anyone can hide it', async () => {
    server({ enabled: true, sessions: [] }, 'learner');
    const me = person({ identity: 'a', name: 'Amina', local: true });
    const sharing = {
      ...teacher,
      local: false,
      screenOn: true,
      screenReady: true,
    };
    const connection = new FakeConnection({ people: [me, sharing] });
    await join(connection);
    expect(connection.attached).toEqual([
      { identity: 't', source: 'screen' },
      { identity: 't', source: 'camera' },
    ]);
    expect(screen.getByLabelText('Bildschirm von Ustadha Maryam')).toBeTruthy();
    expect(screen.getByLabelText('Ustadha Maryam')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Lehrkraft ausblenden' }));
    expect(screen.queryByLabelText('Ustadha Maryam')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Lehrkraft einblenden' }));
    expect(screen.getByLabelText('Ustadha Maryam')).toBeTruthy();

    // Camera off while sharing: only the screen, and nothing to hide.
    connection.update({ people: [me, { ...sharing, cameraOn: false }] });
    expect(screen.queryByLabelText('Ustadha Maryam')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lehrkraft ausblenden' })).toBeNull();
  });

  it('lets the teacher put a background behind the camera and remembers it', async () => {
    server({ enabled: true, sessions: [] });
    localStorage.removeItem('suffa.liveBackground');
    const connection = new FakeConnection({ people: [teacher], canPublish: true });
    await join(connection, true, true);
    expect(screen.getByText('Hintergrund: Keiner')).toBeTruthy();
    await userEvent.click(screen.getByText('Hintergrund: Keiner'));
    await userEvent.click(screen.getByRole('radio', { name: 'Moschee am Abend' }));
    expect(connection.calls).toContain('background:mosque');
    expect(screen.getByRole('radio', { name: 'Moschee am Abend' })).toBeChecked();
    expect(localStorage.getItem('suffa.liveBackground')).toBe('mosque');
    cleanup();

    // The next lesson starts with the same background.
    const next = new FakeConnection({ people: [teacher], canPublish: true });
    await join(next, true, true);
    expect(next.calls).toEqual(['background:mosque']);
    expect(screen.getByText('Hintergrund: Moschee am Abend')).toBeTruthy();
    localStorage.removeItem('suffa.liveBackground');
  });

  it('offers no backgrounds where the browser cannot draw them, or without a camera', async () => {
    server({ enabled: true, sessions: [] });
    await join(new FakeConnection({ people: [teacher], canPublish: true }), true, false);
    expect(screen.queryByText(/Hintergrund:/)).toBeNull();
    cleanup();

    server({ enabled: true, sessions: [session({ learnerCameras: false })] }, 'learner');
    const me = person({ identity: 'a', name: 'Amina', local: true, floor: true });
    await join(
      new FakeConnection({
        people: [me, { ...teacher, local: false }],
        canPublish: true,
      }),
      true,
      true
    );
    expect(screen.queryByText(/Hintergrund:/)).toBeNull();
  });

  it('says so when the background cannot be switched on', async () => {
    server({ enabled: true, sessions: [] });
    localStorage.removeItem('suffa.liveBackground');
    const connection = new FakeConnection({ people: [teacher], canPublish: true });
    connection.setBackground = async () => {
      throw new Error('no webgl');
    };
    await join(connection, true, true);
    await userEvent.click(screen.getByText('Hintergrund: Keiner'));
    await userEvent.click(screen.getByRole('radio', { name: 'Weichzeichnen' }));
    expect(
      await screen.findByText(/Der Hintergrund ließ sich nicht einschalten/)
    ).toBeTruthy();
    // Not in use, so neither shown as chosen nor remembered.
    expect(screen.getByRole('radio', { name: 'Keiner' })).toBeChecked();
    expect(localStorage.getItem('suffa.liveBackground')).toBeNull();
  });

  it('keeps the camera off when its background cannot be loaded', async () => {
    server({ enabled: true, sessions: [] });
    const connection = new FakeConnection({
      people: [{ ...teacher, cameraOn: false, cameraReady: false }],
      canPublish: true,
    });
    connection.setCamera = async () => {
      throw new BackgroundError(new Error('model did not load'));
    };
    await join(connection, true, true);
    await userEvent.click(screen.getByRole('button', { name: 'Kamera an' }));
    expect(
      await screen.findByText(/Die Kamera bleibt aus, bis du ihn wechselst/)
    ).toBeTruthy();
  });

  it('shows that the teacher ended the lesson', async () => {
    server({ enabled: true, sessions: [] }, 'learner');
    const connection = new FakeConnection({ people: [person({ local: true })] });
    await join(connection);
    connection.update({ status: 'disconnected', ended: true });
    expect(await screen.findByText('Der Live-Unterricht ist beendet.')).toBeTruthy();
  });

  it('ends the lesson for everyone from the teacher’s controls', async () => {
    const { requests } = server({ enabled: true, sessions: [] });
    const connection = new FakeConnection({ people: [teacher], canPublish: true });
    await join(connection);
    await userEvent.click(screen.getByRole('button', { name: 'Für alle beenden' }));
    expect(requests.some((r) => r.path.endsWith('/end'))).toBe(true);
    expect(connection.calls).toContain('disconnect');
    expect(await screen.findByText('Du hast den Raum verlassen.')).toBeTruthy();
  });

  it('leaves a room that connects after the page was left', async () => {
    server({ enabled: true, sessions: [] });
    const connection = new FakeConnection({ people: [teacher], canPublish: true });
    let resolve: (c: LiveConnection) => void = () => undefined;
    const connect = vi.fn(() => new Promise<LiveConnection>((done) => (resolve = done)));
    const { unmount } = renderAt(
      <LiveRoom connect={connect} />,
      `/classes/${CLASS_ID}/live/${SESSION_ID}`,
      '/classes/:id/live/:session'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
    await waitFor(() => expect(connect).toHaveBeenCalled());
    unmount();
    resolve(connection);
    await waitFor(() => expect(connection.calls).toEqual(['disconnect']));
  });

  it('says so when the session is not live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'not_live' }, { status: 409 }))
    );
    const connect = vi.fn();
    renderAt(
      <LiveRoom connect={connect} />,
      `/classes/${CLASS_ID}/live/${SESSION_ID}`,
      '/classes/:id/live/:session'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Dieser Live-Unterricht läuft gerade nicht.'
    );
    expect(connect).not.toHaveBeenCalled();
  });
});
