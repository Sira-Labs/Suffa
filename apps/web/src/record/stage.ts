/**
 * What the recording of a live lesson shows (ADR-0029): the teacher's stage as in the room
 * (the shared screen with the teacher's camera in the corner, else the camera), and nobody
 * else's picture. Learners with the floor are heard, not seen.
 */
export interface RecordedPerson {
  identity: string;
  teacher: boolean;
  screen: boolean;
  camera: boolean;
}

export interface RecordedStage {
  /** Whose picture is shown; null while no teacher shows one. */
  identity: string | null;
  main: 'screen' | 'camera' | null;
  /** The teacher's camera small in the corner while the screen is shared. */
  pip: boolean;
}

export function stageOf(people: RecordedPerson[]): RecordedStage {
  const teacher =
    people.find((p) => p.teacher && (p.screen || p.camera)) ??
    people.find((p) => p.teacher);
  if (!teacher) return { identity: null, main: null, pip: false };
  const main = teacher.screen ? 'screen' : teacher.camera ? 'camera' : null;
  return {
    identity: main ? teacher.identity : null,
    main,
    pip: teacher.screen && teacher.camera,
  };
}

/** Pictures go into the recording only from the teacher; every voice that may speak does. */
export function wantsTrack(kind: 'audio' | 'video', teacher: boolean): boolean {
  return kind === 'audio' || teacher;
}
