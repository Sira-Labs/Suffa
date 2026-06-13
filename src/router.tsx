import { createHashRouter } from 'react-router-dom';
import { App } from './App';
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

/**
 * HashRouter: robust für statisches PWA-Hosting (kein Server-Rewrite nötig),
 * funktioniert auch offline aus dem Cache.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
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
    ],
  },
]);
