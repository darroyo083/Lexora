import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.public-demo.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.LEXORA_PUBLIC_DEMO_BASE_URL ?? 'http://127.0.0.1:8088',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium-public-demo',
    use: { ...devices['Desktop Chrome'] },
  }],
});
