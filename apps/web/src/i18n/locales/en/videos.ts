import type { Messages } from '../../types';
import type { videos as de } from '../de/videos';

export const videos: Messages<typeof de> = {
  title: 'Video lessons',
  intro:
    'Lessons on the book on YouTube – with questions along the way where the authors allow it.',
  unavailable: 'The video lessons cannot be reached right now (offline?).',
  chooseLesson: 'Choose a lesson',
  chooseUnit: 'Choose a unit',
  all: 'All',
  unit: 'Unit {{unit}}',
  lesson: 'Lesson {{unit}}',
  noneForCourse: 'No video lessons for your course yet.',
  noneForUnit: 'No video lessons for {{unit}} yet.',
  withQuestions: ' · with questions',
  watched: ' · ✓ watched',
  back: '← Video lessons',
  missing: 'This video lesson does not exist (any more).',
  loading: 'Loading …',
  questions_one: '{{count}} question in the video · {{done}} answered',
  questions_other: '{{count}} questions in the video · {{done}} answered',
  pendingConsent: 'Questions and transcript will follow once the authors have agreed.',
  adminConsent:
    'Admin: learners only see questions and transcript once the channel’s permission is set to “Allowed” (Administration → Videos).',
  celebrateWatched: 'Video lesson watched: {{title}}',
  celebrateCheckpoint: 'Checkpoint done',
  transcript: {
    title: 'Transcript',
    hint: 'Tap a word to see its meaning.',
    meaning: ' – {{gloss}}',
    notInCourse: ' – not in the course vocabulary',
  },
};
