import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The Postgres integration suites reset the same test database, so files run one by one.
    fileParallelism: false,
  },
});
