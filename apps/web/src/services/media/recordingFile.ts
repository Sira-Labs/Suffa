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

/** Is this an audio or video file we can take? */
export function isRecordingFile(file: { name: string; type: string }): boolean {
  if (/^(audio|video)\//i.test(file.type)) return true;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return extension !== undefined && EXTENSIONS.has(extension);
}
