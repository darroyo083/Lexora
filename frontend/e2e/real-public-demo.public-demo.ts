import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';

const BOOK_ID = '00000000-0000-4000-8000-000000000001';
const SOURCE_SHA256 = '7185f637a2a55c22d4e3d846475e6bd6e1682b835f5c76fc76ae91e51aa8d7c9';

async function completeCurrentStep(page: Page) {
  const step = page.locator('.lesson-step');
  const kind = await step.getAttribute('data-kind');
  if (kind === 'fill-blank') {
    for (const textbox of await step.getByRole('textbox').all()) await textbox.fill('probe');
  } else if (kind === 'choice') {
    for (const fieldset of await step.locator('fieldset').all()) await fieldset.getByRole('radio').first().check();
  } else if (kind === 'choice-grid') {
    for (const row of await step.locator('.lesson-choice-grid-row').all()) await row.getByRole('radio').first().check();
  } else if (kind === 'sentence-ordering') {
    const tokens = step.locator('.lesson-token');
    for (let index = 0; index < await tokens.count(); index += 1) await tokens.nth(index).click();
  } else if (kind === 'matching') {
    throw new Error('Reached matching before the requested matching step was detected');
  } else if (kind === 'free-text') {
    await step.getByRole('textbox', { name: 'Your response' }).fill('Probe response');
  }
  const primary = page.locator('.lesson-primary-action');
  if (await primary.isEnabled()) {
    const label = (await primary.textContent())?.trim();
    await primary.click();
    if (label === 'Check answers') {
      await expect(primary).toContainText('Next exercise');
      await primary.click();
    }
  }
}

async function advanceToMatching(page: Page) {
  for (let index = 0; index < 30; index += 1) {
    const matching = page.locator('.lesson-step[data-kind="matching"]');
    if (await matching.isVisible().catch(() => false)) return matching;
    await completeCurrentStep(page);
  }
  throw new Error('Could not reach the real matching exercise on page 2');
}

async function pair(matching: Locator, left: RegExp, right: RegExp) {
  await matching.getByRole('button', { name: left }).click();
  await matching.getByRole('button', { name: right }).click();
}

test('serves one real precomputed source in Classic and Interactive modes', async ({ page, request }) => {
  const metadataResponse = await request.get('/api/public-demo');
  expect(metadataResponse.ok()).toBe(true);
  expect(await metadataResponse.json()).toMatchObject({
    mode: 'precomputed-real-read-only',
    bookId: BOOK_ID,
    pageCount: 4,
    analysisTriggering: false,
    analysisOrigin: 'precomputed-real-provider',
    provider: 'opencode-go',
    model: 'mimo-v2.5',
    sourceSha256: SOURCE_SHA256,
  });

  const sourceResponse = await request.get(`/api/books/${BOOK_ID}/source`);
  expect(sourceResponse.ok()).toBe(true);
  const source = await sourceResponse.body();
  expect(createHash('sha256').update(source).digest('hex')).toBe(SOURCE_SHA256);

  const browserRequests: string[] = [];
  page.on('request', (browserRequest) => browserRequests.push(browserRequest.url()));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
  });
  await page.goto('/demo');
  await expect(page.locator('.interactive-lesson')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mein Morgen');
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText('Upload PDF', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Process page', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Update analysis', { exact: true })).toHaveCount(0);
  await expect(page.getByText('DEV', { exact: true })).toHaveCount(0);

  await page.locator('.lesson-classic-link').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input.page-input')).toHaveValue('1');
  await page.getByRole('button', { name: 'Interactive' }).click();
  await expect(page.locator('.interactive-lesson')).toBeVisible();

  expect(browserRequests.some((url) => url.includes('opencode.ai'))).toBe(false);
  expect(browserRequests.some((url) => /\/api\/.*(process|extract|analy[sz])/i.test(url))).toBe(false);
});

test('serves focused public routes with history and responsive layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Turn workbook exercises');
  await page.getByRole('link', { name: 'Explore the product' }).click();
  await expect(page).toHaveURL(/\/product$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The exercise stays whole');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/how-it-works');
  await expect(page.locator('.static-product-preview video')).toBeVisible();
  const video = page.locator('video').last();
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('autoplay', '');
  await expect(video).toHaveAttribute('loop', '');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).not.toHaveAttribute('controls');
  expect(await video.evaluate((element) => (element as HTMLVideoElement).muted)).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(video).toHaveCSS('display', 'none');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/product');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('fixes Match grading for labels resolved to generated IDs and supports retry', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lexora.currentPage', '2');
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
  });
  await page.goto('/demo');
  const matching = await advanceToMatching(page);

  await pair(matching, /1\. die Bäckerei/, /A\. Medikamente/);
  await pair(matching, /2\. die Bibliothek/, /B\. Züge/);
  await pair(matching, /3\. der Bahnhof/, /C\. Brot/);
  await pair(matching, /4\. die Apotheke/, /D\. Bücher/);
  await page.getByRole('button', { name: 'Check answers' }).click();
  const incorrect = page.locator('.lesson-feedback[data-verdict="incorrect"], .lesson-feedback[data-verdict="partially-correct"]');
  await expect(incorrect.first()).toContainText(/Not quite|partly/i);
  await incorrect.first().getByRole('button', { name: 'Try again' }).click();

  await pair(matching, /4\. die Apotheke/, /A\. Medikamente/);
  await pair(matching, /2\. die Bibliothek/, /D\. Bücher/);
  await pair(matching, /1\. die Bäckerei/, /C\. Brot/);
  await pair(matching, /3\. der Bahnhof/, /B\. Züge/);
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.locator('.lesson-feedback[data-verdict="correct"]')).toContainText('Correct');
});

test('keeps Classic usable as a document-first mobile workspace', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/demo');
  await page.getByLabel('Reader mode').getByRole('button', { name: 'Classic' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });

  const layout = page.locator('.reader-layout');
  const pageArea = page.locator('.page-area');
  const [layoutBox, pageAreaBox] = await Promise.all([
    layout.boundingBox(),
    pageArea.boundingBox(),
  ]);
  expect(layoutBox).not.toBeNull();
  expect(pageAreaBox).not.toBeNull();
  await expect(page.locator('.right-rail')).toHaveCount(0);
  expect(pageAreaBox!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await pageArea.evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true);
});

test('keeps grouped Interactive exercises usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
  });
  await page.goto('/demo');
  await expect(page.getByText('1 of 3 exercises')).toBeVisible();
  await expect(page.locator('.lesson-step[data-kind="fill-blank"]')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('resolves every deterministic page-four answer and keeps free text honest', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lexora.currentPage', '4');
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Kleine Wiederholung' })).toBeVisible();

  const blanks = page.locator('.lesson-fill-item input');
  await blanks.nth(0).fill('arbeitest');
  await blanks.nth(1).fill('arbeite');
  await blanks.nth(2).fill('treffen');
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.locator('.lesson-feedback[data-verdict="correct"]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Next exercise' }).click();
  const statements = page.locator('.lesson-choice-item');
  await statements.nth(0).getByText('falsch', { exact: true }).click();
  await statements.nth(1).getByText('richtig', { exact: true }).click();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.locator('.lesson-feedback[data-verdict="correct"]')).toHaveCount(2);

  await page.getByRole('button', { name: 'Next exercise' }).click();
  await page.getByRole('textbox', { name: 'Your response' }).fill(
    'Diese Woche übe ich jeden Tag zehn Minuten.',
  );
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect(page.getByText(/does not claim an automatic grade/i)).toBeVisible();
});

test('enforces the public read-only API boundary', async ({ request }) => {
  expect((await request.post('/api/books', { multipart: {} })).status()).toBe(403);
  expect((await request.post(`/api/books/${BOOK_ID}/pages/1/process`)).status()).toBe(403);
  expect((await request.post(`/api/books/${BOOK_ID}/answer-key/extract`)).status()).toBe(403);
  expect((await request.delete(`/api/books/${BOOK_ID}`)).status()).toBe(403);
  expect((await request.get(`/api/books/${BOOK_ID}/pages/1`, {
    headers: { 'X-HTTP-Method-Override': 'DELETE' },
  })).status()).toBe(403);

  const other = '11111111-1111-4111-8111-111111111111';
  expect((await request.get(`/api/books/${other}`)).status()).toBe(404);
  expect((await request.get(`/api/books%2F${other}%2Fsource`)).ok()).toBe(false);
  expect((await request.get('/api/books/not-a-uuid/pages/1')).ok()).toBe(false);

  expect((await request.get(`/api/books/${BOOK_ID}`)).ok()).toBe(true);
  expect((await request.get(`/api/books/${BOOK_ID}/pages/1`)).ok()).toBe(true);
  expect((await request.get(`/api/books/${BOOK_ID}/pages/1/correction`)).ok()).toBe(true);
  expect((await request.get(`/api/books/${BOOK_ID}/answer-key`)).ok()).toBe(true);
});
