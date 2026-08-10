import { expect, test, type Page } from '@playwright/test';

const requiredEnvironment = [
  'LEXORA_E2E_BOOK_ID',
  'LEXORA_E2E_RESOLVED_PAGE',
  'LEXORA_E2E_CHOICE_PAGE',
  'LEXORA_E2E_GRID_PAGE',
  'LEXORA_E2E_ORDERING_PAGE',
  'LEXORA_E2E_MATCHING_PAGE',
  'LEXORA_E2E_FREE_TEXT_PAGE',
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

test('uses real page authority for incorrect, reveal, retry, and Classic fallback', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
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
    await expect(page.locator(`.lesson-exercise[data-kind="${kind}"]`).first()).toBeVisible();
  }
});
