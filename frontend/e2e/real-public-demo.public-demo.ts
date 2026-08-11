import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';

const BOOK_ID = '00000000-0000-4000-8000-000000000001';
const SOURCE_SHA256 = '1d5ddb54822d9bfd80840fd11412f25c51e2a7535b4a4677b93719545c729e9c';

async function completeCurrentStep(page: Page) {
  const step = page.locator('.lesson-step');
  const kind = await step.getAttribute('data-kind');
  if (kind === 'fill-blank') {
    await step.getByRole('textbox', { name: 'Your answer' }).fill('probe');
  } else if (kind === 'choice' || kind === 'choice-grid') {
    await step.getByRole('radio').first().locator('..').click();
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
    if (label === 'Check answer' || label === 'Save response') {
      await expect(primary).toContainText('Continue');
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

  await page.locator('.lesson-classic-link').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input.page-input')).toHaveValue('1');
  await page.getByRole('button', { name: 'Interactive' }).click();
  await expect(page.locator('.interactive-lesson')).toBeVisible();

  expect(browserRequests.some((url) => url.includes('opencode.ai'))).toBe(false);
  expect(browserRequests.some((url) => /\/process|\/extract|\/analy[sz]e/i.test(url))).toBe(false);
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
  await page.getByRole('button', { name: 'Check answer' }).click();
  const incorrect = page.locator('.lesson-feedback[data-verdict="incorrect"], .lesson-feedback[data-verdict="partially-correct"]');
  await expect(incorrect.first()).toContainText(/Not quite|partly/i);
  await incorrect.first().getByRole('button', { name: 'Try again' }).click();

  await pair(matching, /4\. die Apotheke/, /A\. Medikamente/);
  await pair(matching, /2\. die Bibliothek/, /D\. Bücher/);
  await pair(matching, /1\. die Bäckerei/, /C\. Brot/);
  await pair(matching, /3\. der Bahnhof/, /B\. Züge/);
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('.lesson-feedback[data-verdict="correct"]')).toContainText('Correct');
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
