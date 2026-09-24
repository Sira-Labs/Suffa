import { createHashRouter } from 'react-router-dom';
import { App } from './App';
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
import { Discover } from './modules/discover';
import { FocusReview } from './modules/review';
import { Milestone, UnitPath, UnitStation, Units } from './modules/units';

/**
 * HashRouter: robust for static PWA hosting (no server rewrite needed),
 * also works offline from the cache.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'vocab', element: <VocabTrainer /> },
      { path: 'roots', element: <RootExplorer /> },
      { path: 'reading', element: <Reading /> },
      { path: 'writing', element: <Writing /> },
      { path: 'speaking', element: <Speaking /> },
      { path: 'conjugation', element: <Conjugation /> },
      { path: 'exam', element: <Exam /> },
      { path: 'library', element: <Library /> },
      { path: 'settings', element: <Settings /> },
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
