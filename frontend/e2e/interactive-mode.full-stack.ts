import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const requiredEnvironment = [
  'LEXORA_E2E_BOOK_ID',
  'LEXORA_E2E_RESOLVED_PAGE',
  'LEXORA_E2E_CHOICE_PAGE',
  'LEXORA_E2E_GRID_PAGE',
  'LEXORA_E2E_ORDERING_PAGE',
  'LEXORA_E2E_MATCHING_PAGE',
  'LEXORA_E2E_FREE_TEXT_PAGE',
  'LEXORA_E2E_UNSUPPORTED_PAGE',
] as const;

function environment(name: typeof requiredEnvironment[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the real full-stack acceptance suite.`);
  return value;
}

const bookId = environment('LEXORA_E2E_BOOK_ID');
const representativePages = {
  'choice': Number(environment('LEXORA_E2E_CHOICE_PAGE')),
  'choice-grid': Number(environment('LEXORA_E2E_GRID_PAGE')),
  'sentence-ordering': Number(environment('LEXORA_E2E_ORDERING_PAGE')),
  'matching': Number(environment('LEXORA_E2E_MATCHING_PAGE')),
  'free-text': Number(environment('LEXORA_E2E_FREE_TEXT_PAGE')),
} as const;
const resolvedPage = Number(environment('LEXORA_E2E_RESOLVED_PAGE'));
const unsupportedPage = Number(environment('LEXORA_E2E_UNSUPPORTED_PAGE'));

interface CorrectionResponse {
  slots: Array<{
    interactionKind: string;
    resolution: string;
    entry: { expectedValue: string } | null;
  }>;
}

async function resolvedFillAnswer(request: APIRequestContext): Promise<string> {
  const response = await request.get(`/api/books/${bookId}/pages/${resolvedPage}/correction`);
  expect(response.ok()).toBe(true);
  const correction = await response.json() as CorrectionResponse;
  const slot = correction.slots.find((candidate) => (
    candidate.interactionKind === 'fill-in-line'
    && candidate.resolution === 'RESOLVED'
    && candidate.entry?.expectedValue
  ));
  if (!slot?.entry) throw new Error('The configured resolved page needs an authoritative FillBlank slot.');
  return slot.entry.expectedValue;
}

async function openBook(page: Page, pageNumber: number) {
  await page.addInitScript(({ persistedBookId, persistedPage }) => {
    localStorage.setItem('lexora.currentBookId', persistedBookId);
    localStorage.setItem('lexora.currentPage', String(persistedPage));
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
  }, { persistedBookId: bookId, persistedPage: pageNumber });
  await page.goto('/');
  await expect(page.locator('.interactive-lesson')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('This page is not interactive yet');
}

async function goToPage(page: Page, pageNumber: number) {
  const pageInput = page.locator('input.page-input');
  await pageInput.fill(String(pageNumber));
  await expect(pageInput).toHaveValue(String(pageNumber));
  await expect(page.locator('.interactive-lesson')).toBeVisible();
}

test('uses real page authority for correct, incorrect, reveal, retry, and Classic fallback', async ({ page, request }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  const expected = await resolvedFillAnswer(request);
  await openBook(page, resolvedPage);

  await expect(page.getByRole('button', { name: 'Check answers' })).toBeEnabled();
  const resolvedFill = page.locator('.lesson-exercise[data-kind="fill-blank"]').first();
  await expect(resolvedFill).toBeVisible();
  await resolvedFill.locator('input').first().fill('__definitely_incorrect__');
  await page.getByRole('button', { name: 'Check answers' }).click();

  const incorrect = page.locator('.lesson-feedback[data-verdict="incorrect"]').first();
  await expect(incorrect).toContainText('Not quite');
  await incorrect.getByRole('button', { name: 'Reveal' }).click();
  await expect(incorrect.locator('.lesson-expected')).toContainText('Answer:');
  await incorrect.getByRole('button', { name: 'Try again' }).click();
  await expect(incorrect).toHaveCount(0);
  await resolvedFill.locator('input').first().fill(expected);
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.locator('.lesson-feedback[data-verdict="correct"]').first()).toContainText('Correct');

  expect(requests).toContain(`/api/books/${bookId}/pages/${resolvedPage}`);
  expect(requests).not.toContain(`/api/books/${bookId}/pages`);
  expect(requests).not.toContain(`/api/books/${bookId}/source`);

  await page.getByRole('button', { name: 'Classic' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.page-overlay .blank-input').first()).toBeVisible();
  expect(requests).toContain(`/api/books/${bookId}/source`);
});

test('renders every representative native interaction family from real persisted analyses', async ({ page }) => {
  await openBook(page, resolvedPage);

  for (const [kind, pageNumber] of Object.entries(representativePages)) {
    await goToPage(page, pageNumber);
    const exercise = page.locator(`.lesson-exercise[data-kind="${kind}"]`).first();
    await expect(exercise).toBeVisible();
    if (kind === 'choice' || kind === 'choice-grid') {
      const option = exercise.getByRole('radio').first();
      await option.locator('..').click();
      await expect(option).toBeChecked();
    } else if (kind === 'sentence-ordering') {
      const token = exercise.locator('.lesson-token').first();
      await token.click();
      await expect(token).toHaveAttribute('aria-pressed', 'true');
    } else if (kind === 'matching') {
      const columns = exercise.locator('.lesson-matching-columns > div');
      const left = columns.nth(0).locator('.lesson-match-item').first();
      const right = columns.nth(1).locator('.lesson-match-item').first();
      await left.click();
      await right.click();
      await expect(exercise.locator('.lesson-pairs')).toBeVisible();
    } else if (kind === 'free-text') {
      const response = exercise.getByRole('textbox');
      await response.fill('Full-stack learner response');
      await expect(response).toHaveValue('Full-stack learner response');
    }
  }
});

test('keeps Classic navigation, overlays, interactions, and correction authoritative', async ({ page, request }) => {
  const expected = await resolvedFillAnswer(request);
  await openBook(page, resolvedPage);
  await expect(page.locator('.lesson-context').first()).toBeVisible();

  await page.getByRole('button', { name: 'Classic' }).click();
  await expect(page.locator('.interactive-lesson')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  const overlayInput = page.locator('.page-overlay .blank-input').first();
  await overlayInput.fill('__definitely_incorrect__');
  await page.getByRole('button', { name: /Check answers/ }).click();
  await expect(page.getByLabel('Incorrect').first()).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).first().click();
  await expect(page.getByText('Answer key:', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await overlayInput.fill(expected);
  await expect(overlayInput).toHaveValue(expected);
  await page.getByRole('button', { name: /Check answers/ }).click();
  await expect(page.getByText('Correct', { exact: true }).first()).toBeVisible();

  const pageInput = page.locator('input.page-input');
  const canvas = page.locator('canvas').first();
  const originalRender = await canvas.evaluate((element) => element.toDataURL());
  await pageInput.fill(String(resolvedPage + 1));
  await expect(pageInput).toHaveValue(String(resolvedPage + 1));
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(originalRender);
  const nextRender = await canvas.evaluate((element) => element.toDataURL());
  await pageInput.fill(String(resolvedPage));
  await expect(pageInput).toHaveValue(String(resolvedPage));
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(nextRender);
  await expect(page.locator('.page-overlay .blank-input').first()).toBeVisible();

  await page.getByRole('button', { name: 'Interactive' }).click();
  await expect(page.locator('.interactive-lesson')).toBeVisible();
});

test('navigates to unsupported content and returns through the real Classic fallback', async ({ page }) => {
  await openBook(page, resolvedPage);
  await goToPage(page, unsupportedPage);
  await expect(page.getByRole('heading', { name: 'This page is not interactive yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Classic mode' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
});
