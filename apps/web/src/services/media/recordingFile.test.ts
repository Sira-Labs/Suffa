import { describe, expect, it } from 'vitest';
import { isRecordingFile } from './recordingFile';

describe('isRecordingFile', () => {
  it('takes audio and video types', () => {
    expect(isRecordingFile({ name: 'a', type: 'video/mp4' })).toBe(true);
    expect(isRecordingFile({ name: 'a', type: 'audio/x-m4a' })).toBe(true);
  });

  it('takes an MP4 that the phone labels as a generic file', () => {
    expect(
      isRecordingFile({ name: 'Stunde 5.MP4', type: 'application/octet-stream' })
    ).toBe(true);
    expect(isRecordingFile({ name: 'Stunde.mov', type: '' })).toBe(true);
  });

  it('refuses other files', () => {
    expect(isRecordingFile({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
    expect(isRecordingFile({ name: 'noext', type: '' })).toBe(false);
  });
});
