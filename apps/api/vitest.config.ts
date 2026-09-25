import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests use the shared rules from source; the build and the image use its dist.
    alias: {
      '@suffa/engagement': fileURLToPath(
        new URL('../../packages/engagement/src/index.ts', import.meta.url)
      ),
      '@suffa/llm': fileURLToPath(
        new URL('../../packages/llm/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The Postgres integration suites reset the same test database, so files run one by one.
    fileParallelism: false,
  },
});
