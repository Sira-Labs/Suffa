import { describe, expect, it } from 'vitest';
import { recordingContentType } from '../src/media/service.js';

describe('recordingContentType', () => {
  it('keeps a known audio or video type', () => {
    expect(recordingContentType('video/mp4', 'x.mp4')).toBe('video/mp4');
    expect(recordingContentType('Audio/MPEG; charset=binary', 'x')).toBe('audio/mpeg');
  });

  it('decides by extension when the declared type is generic or empty', () => {
    expect(recordingContentType('application/octet-stream', 'Stunde.MP4')).toBe(
      'video/mp4'
    );
    expect(recordingContentType('', 'Aufnahme.m4a')).toBe('audio/mp4');
    expect(recordingContentType('video/x-unknown', 'clip.mov')).toBe('video/quicktime');
  });

  it('refuses files that are not audio or video', () => {
    expect(recordingContentType('application/pdf', 'notes.mp4')).toBeNull();
    expect(recordingContentType('application/octet-stream', 'archive.zip')).toBeNull();
    expect(recordingContentType('', 'no-extension')).toBeNull();
  });
});
