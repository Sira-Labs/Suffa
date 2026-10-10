/**
 * Interface texts for course data that lives in @suffa/engagement and the services (stage
 * names, stage tests, badges, courses, paces). That data stays German, shared with the server;
 * the screens show it through these lookups in the interface language (story 16.3). An id
 * without a catalogue entry falls back to the German text the data carries.
 */
import type { CourseId, Stage } from '@suffa/engagement';
import i18n from '@/i18n';

/** Keys built from data ids are not known to the typed `t`. */
const untyped = i18n as unknown as { t(key: string, options?: object): string };

/**
 * The text under `key` in the interface language, or `fallback` for unknown data. With a
 * `count` in `options`, a key with only `_one`/`_other` forms counts as known.
 */
export function dataText(
  key: string,
  fallback: string,
  options?: Record<string, unknown>
): string {
  return i18n.exists(key, options) ? untyped.t(key, options) : fallback;
}

export function stageName(stage: Stage): string {
  return dataText(`units:stageNames.${stage.ref}`, stage.name);
}

export function stageTest(stage: Stage): string | null {
  return stage.test === null
    ? null
    : dataText(`units:stageTests.${stage.ref}`, stage.test);
}

export function stageBadge(stage: Stage): string {
  return dataText(`units:stageBadges.${stage.ref}`, stage.badge);
}

export function courseName(course: { id: CourseId | string; name: string }): string {
  return dataText(`units:courses.${course.id}`, course.name);
}
