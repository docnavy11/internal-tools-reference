import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/server/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
    globalSetup: ['tests/server/global-setup.ts'],
    setupFiles: ['tests/server/setup.ts'],
    // Tests share one database and each runs inside a rolled-back transaction,
    // so files run one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
