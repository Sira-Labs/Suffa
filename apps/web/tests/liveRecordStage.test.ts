import { describe, expect, it } from 'vitest';
import { stageOf, wantsTrack, type RecordedPerson } from '@/record/stage';

/** ADR-0029: the recording shows the teacher's stage only; learners are heard, never seen. */
const teacher = (over: Partial<RecordedPerson> = {}): RecordedPerson => ({
  identity: 't',
  teacher: true,
  screen: false,
  camera: false,
  ...over,
});
const learner: RecordedPerson = {
  identity: 'a',
  teacher: false,
  screen: false,
  camera: true,
};

describe('what the recording shows', () => {
  it('shows the shared screen with the teacher’s camera in the corner', () => {
    expect(stageOf([learner, teacher({ screen: true, camera: true })])).toEqual({
      identity: 't',
      main: 'screen',
      pip: true,
    });
  });

  it('shows the teacher’s camera while nothing is shared', () => {
    expect(stageOf([teacher({ camera: true })])).toEqual({
      identity: 't',
      main: 'camera',
      pip: false,
    });
  });

  it('shows no learner’s camera, even when the teacher shows nothing', () => {
    expect(stageOf([learner, teacher()])).toEqual({
      identity: null,
      main: null,
      pip: false,
    });
    expect(stageOf([learner])).toEqual({ identity: null, main: null, pip: false });
  });

  it('records every voice but only the teacher’s pictures', () => {
    expect(wantsTrack('audio', false)).toBe(true);
    expect(wantsTrack('audio', true)).toBe(true);
    expect(wantsTrack('video', true)).toBe(true);
    expect(wantsTrack('video', false)).toBe(false);
  });
});
