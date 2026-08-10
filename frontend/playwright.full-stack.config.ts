import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.full-stack.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.LEXORA_E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium-full-stack',
    use: { ...devices['Desktop Chrome'] },
  }],
});
