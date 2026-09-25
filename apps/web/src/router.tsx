import { RecordingPlayer } from './modules/classes/RecordingPlayer';
import { LiveQuiz } from './modules/classes/LiveQuiz';
import { ClassPage } from './modules/classes/ClassPage';
import { Badges } from './modules/engagement/Badges';
import { createBrowserRouter } from 'react-router-dom';
import { App } from './App';
import { migrateLegacyHashUrl } from './services/legacyHashUrl';
import { RouteError } from './components';
import { Dashboard } from './modules/dashboard';
import { VocabTrainer } from './modules/vocab';
import { RootExplorer } from './modules/roots';
import { Reading } from './modules/reading';
import { Writing } from './modules/writing';
import { Speaking } from './modules/speaking';
import { Conjugation } from './modules/conjugation';
import { Exam } from './modules/exam';
import { Library } from './modules/library';
import { Settings } from './modules/settings';
import { More, Training } from './modules/more';
import { Alphabet, AlphabetLessonPage } from './modules/alphabet';
import { Discover } from './modules/discover';
import { FocusReview } from './modules/review';
import { Milestone, UnitPath, UnitStation, Units } from './modules/units';
import { Admin } from './modules/admin';
import { SignIn } from './modules/account';
import { Classes, Join } from './modules/classes';
import { Tutor } from './modules/tutor';
import { VideoLesson, VideoLessons } from './modules/videos';

/**
 * Normal paths (story 2.6, ADR-0013): Caddy answers unknown paths with index.html and the
 * service worker does the same offline (navigateFallback), so deep links work everywhere.
 * Old `/#/…` links are rewritten before the router reads the URL.
 */
migrateLegacyHashUrl(window.location, window.history);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'alphabet', element: <Alphabet /> },
      { path: 'alphabet/:lesson', element: <AlphabetLessonPage /> },
      { path: 'vocab', element: <VocabTrainer /> },
      { path: 'roots', element: <RootExplorer /> },
      { path: 'reading', element: <Reading /> },
      { path: 'writing', element: <Writing /> },
      { path: 'speaking', element: <Speaking /> },
      { path: 'conjugation', element: <Conjugation /> },
      { path: 'exam', element: <Exam /> },
      { path: 'library', element: <Library /> },
      { path: 'login', element: <SignIn /> },
      { path: 'settings', element: <Settings /> },
      { path: 'admin', element: <Admin /> },
      { path: 'classes', element: <Classes /> },
      { path: 'classes/:id', element: <ClassPage /> },
      { path: 'classes/:id/recordings/:mediaId', element: <RecordingPlayer /> },
      { path: 'classes/:id/quiz', element: <LiveQuiz /> },
      { path: 'tutor', element: <Tutor /> },
      { path: 'videos', element: <VideoLessons /> },
      { path: 'videos/:id', element: <VideoLesson /> },
      { path: 'badges', element: <Badges /> },
      { path: 'join/:token', element: <Join /> },
      { path: 'more', element: <More /> },
      { path: 'training', element: <Training /> },
      { path: 'discover', element: <Discover /> },
      { path: 'review', element: <FocusReview /> },
      { path: 'units', element: <Units /> },
      { path: 'units/:unit', element: <UnitPath /> },
      { path: 'units/:unit/:station', element: <UnitStation /> },
      { path: 'milestone/:stage', element: <Milestone /> },
    ],
  },
]);
