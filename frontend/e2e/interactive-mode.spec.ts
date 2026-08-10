import { expect, test, type Page, type Route } from '@playwright/test';

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

async function mockWorkbook(page: Page, mode: 'classic' | 'interactive') {
  await page.addInitScript(({ bookId, readerMode }) => {
    localStorage.setItem('lexora.currentBookId', bookId);
    localStorage.setItem('lexora.currentPage', '1');
    localStorage.setItem('lexora.readerMode.v1', readerMode);
  }, { bookId: BOOK_ID, readerMode: mode });

  await page.route('**/api/books/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/books/${BOOK_ID}`) return json(route, { id: BOOK_ID, pageCount: 2 });
    if (url.pathname === `/api/books/${BOOK_ID}/source`) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf() });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/pages`) return json(route, [pageOne]);
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

test('completes native interactions, checks conservatively, and restores work', async ({ page }) => {
  await mockWorkbook(page, 'interactive');
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await page.getByRole('textbox', { name: /Answer 1/i }).fill('bin');
  await page.getByRole('radio', { name: 'A', exact: true }).first().locator('..').click();
  await page.getByRole('radio', { name: 'Ordnen Sie zu.: B' }).locator('..').click();
  await page.getByRole('button', { name: 'Ich' }).click();
  await page.getByRole('button', { name: 'lerne', exact: true }).click();
  await page.getByRole('button', { name: /1\. lernen/ }).click();
  await page.getByRole('button', { name: /A\. study/ }).click();
  await page.getByRole('textbox', { name: 'Your response' }).fill('Eine freie Antwort.');
  await page.getByRole('button', { name: 'Check answers' }).click();

  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByText(/No authoritative answer is mapped/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Answer 1/i })).toHaveValue('bin');
  await expect(page.getByRole('textbox', { name: 'Your response' })).toHaveValue('Eine freie Antwort.');
});

test('persists mode, navigates to an unavailable lesson, and keeps Classic fallback', async ({ page }) => {
  await mockWorkbook(page, 'classic');
  await page.goto('/');

  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Interactive' }).click();
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lexora.readerMode.v1'))).toBe('interactive');

  await page.getByRole('navigation', { name: 'Lesson pages' }).first().getByRole('button', { name: /Next/ }).click();
  await expect(page.getByRole('heading', { name: 'This page is not interactive yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Classic mode' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lexora.readerMode.v1'))).toBe('classic');
  await expect(page.locator('canvas')).toBeVisible();
});
