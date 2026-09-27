/**
 * The course switch (ADR-0025): which textbook stream the learning path follows. A class
 * follows one course; learners choose theirs here (the class page offers its course).
 */
import type { CourseId } from '@suffa/engagement';
import { OFFERED_COURSES, useActiveCourse, useSetCourse } from '@/services/courses';

export function CourseSwitch() {
  const active = useActiveCourse();
  const setCourse = useSetCourse();
  if (OFFERED_COURSES.length < 2) return null;
  return (
    <div className="segmented" role="group" aria-label="Kurs">
      {OFFERED_COURSES.map((c) => (
        <button
          key={c.id}
          type="button"
          className="segmented-item"
          aria-pressed={c.id === active}
          onClick={() => void setCourse(c.id as CourseId)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
