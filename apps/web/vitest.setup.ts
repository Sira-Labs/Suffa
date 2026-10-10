import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
// Interface texts (story 16.3): German catalogues, loaded synchronously.
import './src/i18n';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
