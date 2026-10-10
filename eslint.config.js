import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import suffa from './apps/web/eslint/no-hardcoded-ui-text.js';

/**
 * Areas whose interface text already comes from the i18n catalogues (story 16.3). New
 * hard-coded text there fails the lint; the list grows module by module.
 */
const TRANSLATED = [
  'apps/web/src/App.tsx',
  'apps/web/src/components/**/*.tsx',
  'apps/web/src/modules/account/**/*.tsx',
  'apps/web/src/modules/admin/**/*.tsx',
  'apps/web/src/modules/content/**/*.tsx',
  'apps/web/src/modules/more/**/*.tsx',
  'apps/web/src/modules/settings/**/*.tsx',
  'apps/web/src/modules/library/**/*.tsx',
  'apps/web/src/modules/videos/**/*.tsx',
  'apps/web/src/modules/discover/**/*.tsx',
  'apps/web/src/modules/tutor/**/*.tsx',
  'apps/web/src/modules/sources/**/*.tsx',
];

export default tseslint.config(
  {
    // .claude/worktrees: temporary checkouts of Claude Code agents, not part of the repo.
    ignores: ['**/dist', '**/dev-dist', '**/coverage', '**/node_modules', '.claude/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Service worker additions (push), plain JS in the PWA's public folder.
    files: ['apps/web/public/**/*.js'],
    languageOptions: { ecmaVersion: 2022, globals: globals.serviceworker },
  },
  {
    // Node scripts for maintainers (content tooling).
    files: ['tools/**/*.mjs', 'apps/e2e/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
  },
  {
    files: TRANSLATED,
    ignores: ['**/*.test.tsx'],
    plugins: { suffa },
    rules: { 'suffa/no-hardcoded-ui-text': 'error' },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}', '**/vitest.setup.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier
);
