import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { existsSync } from 'node:fs';

loadEnvConfig(process.cwd());
if (existsSync('.env.e2e.local')) process.loadEnvFile('.env.e2e.local');
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external || 'http://127.0.0.1:3100',
    // Traces can contain passwords and tokens. Do not retain them.
    trace: 'off', video: 'off', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testMatch: /public\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-360', testMatch: /public\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
    { name: 'tablet-768', testMatch: /public\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'webkit', testMatch: /public\.spec\.ts/, use: { ...devices['Desktop Safari'] } },
    { name: 'live', testMatch: /live\.spec\.ts/, retries: 0, use: { ...devices['Desktop Chrome'], screenshot: 'off' } },
  ],
  webServer: external ? undefined : {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
