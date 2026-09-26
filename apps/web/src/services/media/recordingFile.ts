/**
 * Which files the recording upload takes. The file input has no `accept` filter: on phones
 * the Google Drive provider labels many MP4s as `application/octet-stream`, and a filter
 * such as `audio/*,video/*` greys them out. The type or the extension decides instead; the
 * server applies the same rule and ffmpeg checks the real content.
 */
const EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'flac',
  'mp4',
  'm4v',
  'mov',
  'webm',
  'mkv',
  'mpg',
  'mpeg',
]);

/** The types the server stores as they are (same list as `recordingContentType` in the API). */
const CONTENT_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-m4v',
  'video/mpeg',
]);

const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/**
 * Is this an audio or video file the server will take? Same rule as the API: a known type,
 * or a known extension when the type is generic, empty or another audio/video type.
 */
export function isRecordingFile(file: { name: string; type: string }): boolean {
  const type = file.type.split(';')[0]!.trim().toLowerCase();
  if (CONTENT_TYPES.has(type)) return true;
  const generic =
    GENERIC_TYPES.has(type) || type.startsWith('audio/') || type.startsWith('video/');
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return generic && extension !== undefined && EXTENSIONS.has(extension);
}
