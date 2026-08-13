import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BOOK_ID = '11111111-1111-1111-1111-111111111111';

function tinyPdf(): Buffer {
  const streamOne = 'BT /F1 18 Tf 72 720 Td (Lexora Classic Reader - Page 1) Tj ET';
  const streamTwo = 'BT /F1 18 Tf 72 720 Td (Lexora Classic Reader - Page 2) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${streamOne.length} >>\nstream\n${streamOne}\nendstream`,
    `<< /Length ${streamTwo.length} >>\nstream\n${streamTwo}\nendstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source, 'ascii'));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source, 'ascii');
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source, 'ascii');
}

const bbox = (x: number, y: number, width = 0.2, height = 0.025) => ({ x, y, width, height });

const analysis = {
  schemaVersion: '1.4', pageNumber: 1, width: 1200, height: 1600, language: 'de',
  textSpans: [
    { id: 'title', text: 'Interaktive Grammatik', confidence: 0.99, confidenceScope: 'line', bbox: bbox(0.1, 0.04, 0.5) },
    { id: 'instruction', text: 'Bearbeiten Sie alle Aufgaben.', confidence: 0.98, confidenceScope: 'line', bbox: bbox(0.1, 0.13, 0.5) },
    { id: 'fill-prompt', text: 'Ich ___ heute hier.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.24, 0.5) },
    { id: 'choice-prompt', text: 'Wählen Sie eine Form.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.34, 0.5) },
    { id: 'grid-prompt', text: 'Ordnen Sie zu.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.44, 0.5) },
    { id: 'order-prompt', text: 'Bilden Sie den Satz.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.55, 0.5) },
    { id: 'match-prompt', text: 'Verbinden Sie die Paare.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.66, 0.5) },
    { id: 'free-prompt', text: 'Schreiben Sie eine Antwort.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.8, 0.5) },
  ],
  exerciseBlanks: [{ id: 'blank-1', kind: 'fill-in-line', lineBbox: bbox(0.3, 0.27), interactionBbox: bbox(0.29, 0.26), detectionMethod: 'horizontal-line-v1', candidateScore: 0.94, nearbyTextSpanIds: ['fill-prompt'] }],
  blankDetection: null,
  choiceGroups: [{ id: 'options', options: [{ id: 'option-a', label: 'A' }, { id: 'option-b', label: 'B' }] }],
  choiceTargets: [{ id: 'choice-1', kind: 'choice', targetBbox: bbox(0.3, 0.37), interactionBbox: bbox(0.29, 0.36), optionGroupId: 'options', detectionMethod: 'empty-ring-v1', candidateScore: 0.92, nearbyTextSpanIds: ['choice-prompt'] }],
  choiceDetection: null,
  choiceGrids: [{ id: 'grid-1', kind: 'choice-grid', gridBbox: bbox(0.1, 0.46, 0.7, 0.06), optionGroupId: 'options', detectionMethod: 'table-grid-v1', candidateScore: 0.91, rows: [{ id: 'row-1', rowBbox: bbox(0.1, 0.47, 0.7), promptBbox: bbox(0.1, 0.47), nearbyTextSpanIds: ['grid-prompt'], cells: [{ id: 'cell-a', optionId: 'option-a', cellBbox: bbox(0.5, 0.47), interactionBbox: bbox(0.5, 0.47) }, { id: 'cell-b', optionId: 'option-b', cellBbox: bbox(0.6, 0.47), interactionBbox: bbox(0.6, 0.47) }] }] }],
  choiceGridDetection: null,
  sentenceOrderings: [{ id: 'ordering-1', kind: 'sentence-ordering', bbox: bbox(0.1, 0.58, 0.7), exerciseId: 'order-exercise', promptIndex: 1, detectionMethod: 'sentence-ordering-v1', candidateScore: 0.9, nearbyTextSpanIds: ['order-prompt'], items: [{ id: 'word-1', text: 'Ich', bbox: bbox(0.1, 0.58), originalIndex: 1 }, { id: 'word-2', text: 'lerne', bbox: bbox(0.3, 0.58), originalIndex: 2 }] }],
  sentenceOrderingDetection: null,
  matchingInteractions: [{ id: 'matching-1', kind: 'matching', bbox: bbox(0.1, 0.69, 0.7, 0.07), detectionMethod: 'matching-v1', candidateScore: 0.89, cardinality: 'one-to-one', nearbyTextSpanIds: ['match-prompt'], leftItems: [{ id: 'left-1', label: '1', text: 'lernen', bbox: bbox(0.1, 0.71), anchorBbox: null, nearbyTextSpanIds: [] }], rightItems: [{ id: 'right-1', label: 'A', text: 'study', bbox: bbox(0.5, 0.71), anchorBbox: null, nearbyTextSpanIds: [] }] }],
  matchingDetection: null,
  freeTextInteractions: [{ id: 'free-1', kind: 'free-text', bbox: bbox(0.1, 0.83, 0.7, 0.08), detectionMethod: 'free-text-v1', candidateScore: 0.88, nearbyTextSpanIds: ['free-prompt'], responseLines: [{ id: 'line-1', bbox: bbox(0.1, 0.87, 0.7) }] }],
  freeTextDetection: null,
  processor: { engine: 'lexora-ai', engineVersion: '2.0', model: 'fixture', language: 'de', parameters: {}, durationMs: 20, processedAt: '2026-08-10T10:00:00Z' },
};

const pageOne = { id: 'page-1', bookId: BOOK_ID, pageNumber: 1, processingStatus: 'READY', analysis: JSON.stringify(analysis), failureReason: null };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkbook(page: Page, mode: 'classic' | 'interactive', options: { processingPageTwo?: boolean } = {}) {
  await page.addInitScript(({ bookId, readerMode }) => {
    localStorage.setItem('lexora.currentBookId', bookId);
    localStorage.setItem('lexora.currentPage', '1');
    localStorage.setItem('lexora.readerMode.v1', readerMode);
  }, { bookId: BOOK_ID, readerMode: mode });

  await page.route('**/api/public-demo', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: '{}',
  }));

  await page.route('**/api/books/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/books/${BOOK_ID}`) return json(route, { id: BOOK_ID, pageCount: 2 });
    if (url.pathname === `/api/books/${BOOK_ID}/source`) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf() });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/pages/1`) return json(route, pageOne);
    if (url.pathname === `/api/books/${BOOK_ID}/pages/2` && options.processingPageTwo) {
      return json(route, { id: 'page-2', bookId: BOOK_ID, pageNumber: 2, processingStatus: 'OCR', analysis: null, failureReason: null });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/pages/2`) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/answer-key`) {
      return json(route, { id: 'key-1', bookId: BOOK_ID, extractionMethod: 'fixture', parserVersion: '1', sourcePageRange: '2', extractionStatus: 'READY', failureReason: null, extractedAt: 'now', entryCount: 1, entries: [] });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/pages/1/correction`) {
      return json(route, { bookId: BOOK_ID, pageNumber: 1, unitNumber: 7, unitTitle: 'Satzbau', status: 'RESOLVED', slots: [{ interactionKind: 'fill-in-line', ordinal: 0, resolution: 'RESOLVED', entry: { pageNumber: 2, interactionKind: 'fill-in-line', ordinal: 0, expectedValue: 'bin', alternatives: [], caseSensitive: false, punctuationRequired: false, normalizationMode: 'strict', rawSolutionText: 'bin', confidence: 1, mappingWarnings: [] } }] });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/pages/2/correction`) {
      return json(route, { bookId: BOOK_ID, pageNumber: 2, unitNumber: null, unitTitle: null, status: 'UNMAPPED', slots: [] });
    }
    if (url.pathname.endsWith('/pages/2/process')) return json(route, { id: 'page-2', bookId: BOOK_ID, pageNumber: 2, processingStatus: 'PROCESSING', analysis: null, failureReason: null });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

async function advanceToKind(page: Page, kind: string) {
  for (let index = 0; index < 20; index += 1) {
    const target = page.locator(`.lesson-step[data-kind="${kind}"]`);
    if (await target.isVisible().catch(() => false)) return target;
    await page.locator('.lesson-primary-action').click();
  }
  throw new Error(`Could not reach lesson step ${kind}.`);
}

async function backToKind(page: Page, kind: string) {
  for (let index = 0; index < 20; index += 1) {
    const target = page.locator(`.lesson-step[data-kind="${kind}"]`);
    if (await target.isVisible().catch(() => false)) return target;
    await page.locator('.lesson-back-action').click();
  }
  throw new Error(`Could not return to lesson step ${kind}.`);
}

async function expectViewportNative(page: Page) {
  expect(await page.evaluate(() => {
    const area = document.querySelector('.reader-layout-interactive .page-area');
    return {
      documentScroll: document.documentElement.scrollHeight > window.innerHeight,
      areaScroll: area ? area.scrollHeight > area.clientHeight : true,
    };
  })).toEqual({ documentScroll: false, areaScroll: false });
}

test('completes native interactions, checks conservatively, and restores work', async ({ page }) => {
  await mockWorkbook(page, 'interactive');
  await page.goto('/demo');

  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  const fill = await advanceToKind(page, 'fill-blank');
  await fill.getByRole('textbox', { name: /Answer for/ }).fill('bin');
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next exercise' }).click();

  const choice = await advanceToKind(page, 'choice');
  await choice.getByRole('radio', { name: 'A', exact: true }).locator('..').click();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByText('No answer key available')).toBeVisible();
  await page.getByRole('button', { name: 'Next exercise' }).click();

  const grid = await advanceToKind(page, 'choice-grid');
  await grid.getByRole('radio').last().locator('..').click();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await page.getByRole('button', { name: 'Next exercise' }).click();

  const ordering = await advanceToKind(page, 'sentence-ordering');
  await ordering.getByRole('button', { name: 'Ich' }).click();
  await ordering.getByRole('button', { name: 'lerne', exact: true }).click();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await page.getByRole('button', { name: 'Next exercise' }).click();

  const matching = await advanceToKind(page, 'matching');
  await matching.getByRole('button', { name: /1\. lernen/ }).click();
  await matching.getByRole('button', { name: /A\. study/ }).click();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await page.getByRole('button', { name: 'Next exercise' }).click();

  const freeText = await advanceToKind(page, 'free-text');
  await freeText.getByRole('textbox', { name: 'Your response' }).fill('Eine freie Antwort.');
  await page.getByRole('button', { name: 'Next exercise' }).click();
  await expect(page.getByRole('heading', { name: 'Lesson complete' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lesson complete' })).toBeVisible();
  await expect((await backToKind(page, 'free-text')).getByRole('textbox', { name: 'Your response' })).toHaveValue('Eine freie Antwort.');
  await expect((await backToKind(page, 'fill-blank')).getByRole('textbox', { name: /Answer for/ })).toHaveValue('bin');
});

test('persists mode, navigates to an unavailable lesson, and keeps Classic fallback', async ({ page }) => {
  await mockWorkbook(page, 'classic');
  await page.goto('/demo');

  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Interactive' }).click();
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lexora.readerMode.v1'))).toBe('interactive');

  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByRole('heading', { name: 'Turn this page into a guided lesson' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Classic' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lexora.readerMode.v1'))).toBe('classic');
  await expect(page.locator('canvas')).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test(`has no automatically detectable WCAG A or AA violations in ${theme} mode`, async ({ page }) => {
    await mockWorkbook(page, 'interactive');
    await page.addInitScript((themeMode) => localStorage.setItem('lexora.themeMode', themeMode), theme);
    await page.goto('/demo');
    await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('supports keyboard-only mode changes with visible focus', async ({ page }) => {
  await mockWorkbook(page, 'interactive');
  await page.goto('/demo');
  const classic = page.locator('.lesson-classic-link');
  await classic.focus();
  await expect(classic).toBeFocused();
  await expect(classic).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas')).toBeVisible();
  const interactive = page.getByRole('button', { name: 'Interactive' });
  await interactive.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
});

test('supports keyboard operation across all six native interaction families', async ({ page }) => {
  await mockWorkbook(page, 'interactive');
  await page.goto('/demo');

  const openStep = async (stepId: string, kind: string) => {
    await page.evaluate(({ lessonId, nextStepId }) => {
      localStorage.setItem('lexora.lessonProgress.v1', JSON.stringify({ version: 1, stepByLesson: { [lessonId]: nextStepId } }));
    }, { lessonId: `${BOOK_ID}:page:1`, nextStepId: stepId });
    await page.reload();
    return page.locator(`.lesson-step[data-kind="${kind}"]`);
  };

  const fill = await openStep('page-1-fill-blank-1', 'fill-blank');
  await fill.getByRole('textbox', { name: /Answer for/ }).focus();
  await page.keyboard.type('bin');
  await expect(fill.getByRole('textbox', { name: /Answer for/ })).toHaveValue('bin');

  const choice = await openStep('page-1-choice-choice-1', 'choice');
  const choiceRadio = choice.getByRole('radio').first();
  await choiceRadio.focus();
  await page.keyboard.press('Space');
  await expect(choiceRadio).toBeChecked();

  const grid = await openStep('page-1-grid-grid-1', 'choice-grid');
  const gridRadio = grid.getByRole('radio').first();
  await gridRadio.focus();
  await page.keyboard.press('Space');
  await expect(gridRadio).toBeChecked();

  const ordering = await openStep('order-exercise', 'sentence-ordering');
  const token = ordering.locator('.lesson-token').first();
  await token.focus();
  await page.keyboard.press('Enter');
  await expect(token).toHaveAttribute('aria-pressed', 'true');

  const matching = await openStep('page-1-matching-matching-1', 'matching');
  const matchButtons = matching.locator('.lesson-match-item');
  await matchButtons.first().focus();
  await page.keyboard.press('Space');
  await matchButtons.last().focus();
  await page.keyboard.press('Enter');
  await expect(matchButtons.first()).toHaveAttribute('data-paired', 'true');

  const freeText = await openStep('page-1-free-free-1', 'free-text');
  await freeText.getByRole('textbox', { name: 'Your response' }).focus();
  await page.keyboard.type('Keyboard response');
  await expect(freeText.getByRole('textbox', { name: 'Your response' })).toHaveValue('Keyboard response');
});

test('keeps a native interaction inside every target viewport without document scrolling', async ({ page }) => {
  await mockWorkbook(page, 'interactive');
  await page.addInitScript(({ lessonId, stepId }) => {
    localStorage.setItem('lexora.lessonProgress.v1', JSON.stringify({ version: 1, stepByLesson: { [lessonId]: stepId } }));
  }, {
    lessonId: `${BOOK_ID}:page:1`,
    stepId: 'page-1-matching-matching-1',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await expect(page.locator('.lesson-step[data-kind="matching"]')).toBeVisible();

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await expectViewportNative(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await expect(page.locator('.lesson-player-actions')).toBeInViewport();
  }
});

test('uses truthful rotating processing copy, shimmer, Classic fallback, and reduced-motion gating', async ({ page }) => {
  await mockWorkbook(page, 'interactive', { processingPageTwo: true });
  await page.addInitScript(() => localStorage.setItem('lexora.currentPage', '2'));
  await page.goto('/demo');

  await expect(page.getByRole('heading', { name: 'Reading the page' })).toBeVisible();
  const message = page.locator('.lesson-processing-message');
  const shimmer = message.locator('span');
  const initialMessage = await message.textContent();
  await expect.poll(() => message.textContent(), { timeout: 5_000 }).not.toBe(initialMessage);
  await expect(shimmer).toHaveCSS('animation-name', /lesson-message-shimmer/);
  await expect(page.getByRole('button', { name: 'Open Classic' })).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(shimmer).toHaveCSS('animation-name', 'none');
});

test('does not load the Classic PDF renderer during an Interactive session', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await mockWorkbook(page, 'interactive');
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  expect(requested.some((url) => url.includes('/src/reader/PageViewer.tsx'))).toBe(false);
  expect(requested.some((url) => url.includes('pdfjs-dist'))).toBe(false);

  await page.locator('.lesson-classic-link').click();
  await expect(page.locator('canvas')).toBeVisible();
  expect(requested.some((url) => url.includes('/src/reader/PageViewer.tsx'))).toBe(true);
});
