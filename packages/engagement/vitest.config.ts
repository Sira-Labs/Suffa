import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/records.ts'],
      // The rules decide rewards on every device and on the server: every branch is tested.
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
