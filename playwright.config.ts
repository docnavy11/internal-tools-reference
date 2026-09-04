import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The built server is what these tests exercise; it is not built as part of this
// config (CI builds before running). Fail fast with a clear message instead of
// letting webServer time out with an opaque "command exited" error.
const serverEntry = path.resolve(import.meta.dirname, 'dist/server/main.js');
if (!existsSync(serverEntry)) {
  throw new Error(`dist/server/main.js not found. Run "npm run build" before "npm run test:e2e".`);
}

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node dist/server/main.js',
    url: `${baseURL}/readyz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_MODE: 'all',
      PORT: String(PORT),
      MIGRATE_ON_START: 'true',
      AUTH_DEV_LOGIN: 'true',
      LOG_LEVEL: 'warn',
      APP_URL: baseURL,
    },
  },
});
