import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || process.env.PORT || 23945);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
const startServer = process.env.E2E_START_SERVER === 'true';
const nixLibraryPath = (() => {
  const store = '/nix/store';
  if (!existsSync(store)) return process.env.LD_LIBRARY_PATH || '';
  const paths = readdirSync(store)
    .filter((entry) => entry.includes('-mesa-libgbm-'))
    .map((entry) => join(store, entry, 'lib'))
    .filter((path) => existsSync(path));
  return [...new Set([process.env.LD_LIBRARY_PATH || '', ...paths].filter(Boolean))].join(':');
})();

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    launchOptions: {
      env: {
        ...process.env,
        ...(nixLibraryPath ? { LD_LIBRARY_PATH: nixLibraryPath } : {}),
      },
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: startServer
    ? {
        command: `PORT=${port} BASE_PATH=/ pnpm --filter @workspace/barber-manager run dev`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});