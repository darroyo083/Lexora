import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../public/release');
const baseUrl = process.env.LEXORA_CAPTURE_BASE_URL ?? 'http://127.0.0.1:8088';

await mkdir(output, { recursive: true });

async function verifyPublicBoundary(page) {
  const boundary = await page.evaluate(async () => {
    const response = await fetch('/api/public-demo');
    return response.json();
  });
  if (boundary.mode !== 'precomputed-real-read-only'
    || boundary.analysisTriggering !== false
    || boundary.analysisOrigin !== 'precomputed-real-provider'
    || boundary.provider !== 'opencode-go'
    || boundary.model !== 'mimo-v2.5') {
    throw new Error('Release captures require the curated read-only public demo');
  }
}

async function openCleanDemo(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${baseUrl}/demo`, { waitUntil: 'networkidle' });
  await verifyPublicBoundary(page);
  await page.getByRole('heading', { name: 'Mein Morgen' }).waitFor();
}

const browser = await chromium.launch();
try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const page = await desktop.newPage();
  await openCleanDemo(page);

  await page.screenshot({
    path: resolve(output, 'lexora-interactive.webp'),
    type: 'webp',
    quality: 90,
  });

  await page.getByRole('button', { name: 'Classic', exact: true }).first().click();
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  await page.screenshot({
    path: resolve(output, 'lexora-classic.webp'),
    type: 'webp',
    quality: 90,
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Turn workbook exercises/i }).waitFor();
  await page.screenshot({
    path: resolve(output, 'lexora-landing.webp'),
    type: 'webp',
    quality: 90,
  });
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await openCleanDemo(mobilePage);
  await mobilePage.screenshot({
    path: resolve(output, 'lexora-mobile.webp'),
    type: 'webp',
    quality: 90,
  });
  await mobile.close();

  const social = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    colorScheme: 'dark',
  });
  const socialPage = await social.newPage();
  await socialPage.addInitScript(() => localStorage.clear());
  await socialPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await socialPage.getByRole('heading', { name: /Turn workbook exercises/i }).waitFor();
  await socialPage.screenshot({
    path: resolve(output, 'lexora-social.png'),
    type: 'png',
  });
  await social.close();
} finally {
  await browser.close();
}
