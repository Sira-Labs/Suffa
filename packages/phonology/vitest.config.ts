import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      // Letter feedback depends on every rule: every branch is tested.
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
