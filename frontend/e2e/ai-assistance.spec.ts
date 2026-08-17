import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BOOK_ID = '22222222-2222-2222-2222-222222222222';

function tinyPdf(): Buffer {
  const stream = 'BT /F1 18 Tf 72 720 Td (Lexora Classic Reader) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
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
    { id: 'fill-prompt', text: 'Ich ___ heute hier.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.24, 0.5) },
    { id: 'free-prompt', text: 'Schreiben Sie eine Antwort.', confidence: 0.97, confidenceScope: 'line', bbox: bbox(0.1, 0.8, 0.5) },
  ],
  exerciseBlanks: [{ id: 'blank-1', kind: 'fill-in-line', lineBbox: bbox(0.3, 0.27), interactionBbox: bbox(0.29, 0.26), detectionMethod: 'horizontal-line-v1', candidateScore: 0.94, nearbyTextSpanIds: ['fill-prompt'] }],
  blankDetection: null,
  choiceGroups: [], choiceTargets: [], choiceDetection: null,
  choiceGrids: [], choiceGridDetection: null,
  sentenceOrderings: [], sentenceOrderingDetection: null,
  matchingInteractions: [], matchingDetection: null,
  freeTextInteractions: [{ id: 'free-1', kind: 'free-text', bbox: bbox(0.1, 0.83, 0.7, 0.08), detectionMethod: 'free-text-v1', candidateScore: 0.88, nearbyTextSpanIds: ['free-prompt'], responseLines: [{ id: 'line-1', bbox: bbox(0.1, 0.87, 0.7) }] }],
  freeTextDetection: null,
  processor: { engine: 'lexora-ai', engineVersion: '2.0', model: 'fixture', language: 'de', parameters: {}, durationMs: 20, processedAt: '2026-08-10T10:00:00Z' },
};

const pageOne = { id: 'page-1', bookId: BOOK_ID, pageNumber: 1, processingStatus: 'READY', analysis: JSON.stringify(analysis), failureReason: null };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkbook(page: Page) {
  await page.addInitScript(({ bookId }) => {
    localStorage.setItem('lexora.currentBookId', bookId);
    localStorage.setItem('lexora.currentPage', '1');
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
  }, { bookId: BOOK_ID });

  await page.route('**/api/public-demo', (route) => json(route, {
    bookId: BOOK_ID,
    pageCount: 1,
    mode: 'precomputed-real-read-only',
  }));

  await page.route('**/api/books/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/books/${BOOK_ID}`) return json(route, { id: BOOK_ID, pageCount: 1 });
    if (url.pathname === `/api/books/${BOOK_ID}/source`) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf() });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/pages/1`) return json(route, pageOne);
    if (url.pathname === `/api/books/${BOOK_ID}/answer-key`) {
      return json(route, { id: 'key-1', bookId: BOOK_ID, extractionMethod: 'fixture', parserVersion: '1', sourcePageRange: '2', extractionStatus: 'READY', failureReason: null, extractedAt: 'now', entryCount: 1, entries: [] });
    }
    if (url.pathname === `/api/books/${BOOK_ID}/pages/1/correction`) {
      return json(route, { bookId: BOOK_ID, pageNumber: 1, unitNumber: 7, unitTitle: 'Satzbau', status: 'RESOLVED', slots: [{ interactionKind: 'fill-in-line', ordinal: 0, resolution: 'RESOLVED', entry: { pageNumber: 2, interactionKind: 'fill-in-line', ordinal: 0, expectedValue: 'bin', alternatives: [], caseSensitive: false, punctuationRequired: false, normalizationMode: 'strict', rawSolutionText: 'bin', confidence: 1, mappingWarnings: [] } }] });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

type AssistResponse = {
  action: string; status: string; content: string | null; verdict: string | null;
  cached: boolean; siteKey: string | null; message: string | null;
};

async function mockAssist(page: Page, config: { enabled: boolean; siteKey: string | null }, byAction: Record<string, AssistResponse>) {
  await page.route('**/api/ai/assist/config', (route) => json(route, config));
  await page.route('**/api/ai/assist', (route) => {
    const body = route.request().postDataJSON();
    const response = byAction[body.action] ?? {
      action: body.action, status: 'success', content: 'Mocked AI response', verdict: null, cached: false, siteKey: null, message: null,
    };
    return json(route, response);
  });
}

async function openAskLexora(page: Page) {
  await page.getByRole('button', { name: 'Ask Lexora' }).click();
}

async function selectClassicRegion(page: Page, startY = 0.20, endY = 0.34) {
  await page.getByRole('button', { name: /Ask Lexora|Select a region of the source page/ }).click();
  const selectionLayer = page.locator('.page-selection-layer');
  await expect(selectionLayer).toBeVisible();
  const box = await selectionLayer.boundingBox();
  if (!box) throw new Error('Selection layer has no measurable page bounds');
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * startY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * endY, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Ask Lexora' })).toBeVisible();
}

async function advanceToKind(page: Page, kind: string) {
  for (let index = 0; index < 20; index += 1) {
    const target = page.locator(`.lesson-step[data-kind="${kind}"]`);
    if (await target.isVisible().catch(() => false)) return;
    await page.locator('.lesson-primary-action').click();
  }
  throw new Error(`Could not reach lesson step ${kind}.`);
}

async function backToKind(page: Page, kind: string) {
  for (let index = 0; index < 20; index += 1) {
    const target = page.locator(`.lesson-step[data-kind="${kind}"]`);
    if (await target.isVisible().catch(() => false)) return;
    await page.locator('.lesson-back-action').click();
  }
  throw new Error(`Could not return to lesson step ${kind}.`);
}

test('hides Ask Lexora when assist is disabled', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: false, siteKey: null }, {});
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask Lexora' })).toHaveCount(0);
});

test('hint happy path renders a mocked provider response', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {
    hint: { action: 'hint', status: 'success', content: 'Think about the verb form.', verdict: null, cached: false, siteKey: null, message: null },
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await page.locator('.lesson-step[data-kind="fill-blank"] input').fill('bin');
  await openAskLexora(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText('Think about the verb form.')).toBeVisible();
});

test('Interactive Explain and Ask stay coherent and navigable', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {
    explain: {
      action: 'explain', status: 'success',
      content: '### Present tense\n\n- **bin** agrees with *ich*.\n- The sentence means `I am here today`.',
      verdict: null, cached: false, siteKey: null, message: null,
    },
    ask: {
      action: 'ask', status: 'success',
      content: 'Use **bin** because the subject is *ich*.',
      verdict: null, cached: false, siteKey: null, message: null,
    },
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await openAskLexora(page);

  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('heading', { name: 'Present tense', level: 3 })).toBeVisible();
  await expect(page.locator('.ask-lexora-markdown li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Back to Ask Lexora actions' }).click();

  await page.getByRole('button', { name: 'Ask a question…' }).click();
  const question = page.getByRole('textbox', { name: 'Ask about this exercise' });
  await question.fill('Why is bin used here?');
  await question.press('Enter');
  await expect(page.getByText('Use bin because the subject is ich.')).toBeVisible();
});

test('Classic Ask Lexora uses an explicit bounded page selection', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {
    ask: { action: 'ask', status: 'success', content: 'The selected sentence uses a present-tense verb.', verdict: null, cached: false, siteKey: null, message: null },
  });
  let requestBody: Record<string, unknown> | null = null;
  await page.route('**/api/ai/assist', async (route) => {
    requestBody = route.request().postDataJSON();
    return json(route, {
      action: 'ask', status: 'success', content: 'The selected sentence uses a present-tense verb.',
      verdict: null, cached: false, siteKey: null, message: null,
    });
  });

  await page.goto('/demo');
  await page.getByRole('button', { name: 'Classic', exact: true }).first().click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Ask Lexora' }).click();
  await expect(page.locator('.page-selection-layer')).toBeVisible();

  const selectionLayer = page.locator('.page-selection-layer');
  const box = await selectionLayer.boundingBox();
  if (!box) throw new Error('Selection layer has no measurable page bounds');
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.34);
  await page.mouse.up();

  await expect(page.getByRole('dialog', { name: 'Ask Lexora' })).toBeVisible();
  await expect(page.locator('.page-selection-active .page-selection-rectangle')).toBeVisible();
  const panelBox = await page.getByRole('dialog', { name: 'Ask Lexora' }).boundingBox();
  expect(panelBox?.height).toBeLessThan(420);
  await page.getByRole('button', { name: 'Ask a question…' }).click();
  await expect(page.getByRole('button', { name: 'Back to Ask Lexora actions' })).toBeVisible();
  const question = page.getByRole('textbox', { name: 'Ask about this selection' });
  await question.fill('What verb form is used here?');
  await question.press('Enter');
  await expect(page.getByText(/present-tense verb/i)).toBeVisible();
  await expect(page.locator('.page-selection-active .page-selection-rectangle')).toBeVisible();

  expect(requestBody).toMatchObject({
    action: 'ask',
    exerciseId: null,
    question: 'What verb form is used here?',
    selection: {
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    },
  });
  const selection = requestBody?.selection as { x: number; y: number; width: number; height: number };
  expect(selection.x).toBeGreaterThanOrEqual(0);
  expect(selection.y).toBeGreaterThanOrEqual(0);
  expect(selection.x + selection.width).toBeLessThanOrEqual(1);
  expect(selection.y + selection.height).toBeLessThanOrEqual(1);
});

for (const scenario of [
  { name: 'Explain', action: 'explain' },
  { name: 'Translate', action: 'translate' },
  { name: 'Ask', action: 'ask' },
] as const) {
  test(`fresh Classic selection starts ${scenario.name} without visiting Interactive`, async ({ page }) => {
    await mockWorkbook(page);
    await mockAssist(page, { enabled: true, siteKey: null }, {});
    const requests: Record<string, unknown>[] = [];
    await page.route('**/api/ai/assist', (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      requests.push(body);
      return json(route, {
        action: scenario.action, status: 'success', content: `Classic ${scenario.name} succeeded.`,
        verdict: null, cached: false, siteKey: null, message: null,
      });
    });

    await page.goto('/demo');
    await page.getByRole('button', { name: 'Classic', exact: true }).first().click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await selectClassicRegion(page);
    if (scenario.action === 'ask') {
      await page.getByRole('button', { name: 'Ask a question…' }).click();
      await page.getByRole('textbox', { name: 'Ask about this selection' }).fill('What is shown here?');
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
    } else if (scenario.action === 'translate') {
      await page.getByRole('button', { name: 'Translate to Spanish' }).click();
    } else {
      await page.getByRole('button', { name: 'Explain', exact: true }).click();
    }

    await expect(page.getByText(`Classic ${scenario.name} succeeded.`)).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ action: scenario.action, exerciseId: null });
  });
}

test('Classic region replacement starts a new action without visiting Interactive', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {});
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/ai/assist', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    return json(route, {
      action: body.action, status: 'success', content: `Region ${requests.length} succeeded.`,
      verdict: null, cached: false, siteKey: null, message: null,
    });
  });

  await page.goto('/demo');
  await page.getByRole('button', { name: 'Classic', exact: true }).first().click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await selectClassicRegion(page, 0.20, 0.34);
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByText('Region 1 succeeded.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Ask Lexora actions' }).click();
  await page.getByRole('button', { name: 'Choose another region' }).click();

  const selectionLayer = page.locator('.page-selection-layer');
  const box = await selectionLayer.boundingBox();
  if (!box) throw new Error('Selection layer has no measurable page bounds');
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.74);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.86, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Translate to Spanish' }).click();
  await expect(page.getByText('Region 2 succeeded.')).toBeVisible();

  await page.getByRole('button', { name: 'Back to Ask Lexora actions' }).click();
  await page.getByRole('button', { name: 'Choose another region' }).click();
  const thirdSelectionLayer = page.locator('.page-selection-layer');
  const thirdBox = await thirdSelectionLayer.boundingBox();
  if (!thirdBox) throw new Error('Third selection layer has no measurable page bounds');
  await page.mouse.move(thirdBox.x + thirdBox.width * 0.12, thirdBox.y + thirdBox.height * 0.40);
  await page.mouse.down();
  await page.mouse.move(thirdBox.x + thirdBox.width * 0.70, thirdBox.y + thirdBox.height * 0.56, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByText('Region 3 succeeded.')).toBeVisible();

  expect(requests).toHaveLength(3);
  expect(requests[0].selection).not.toEqual(requests[1].selection);
  expect(requests[1].selection).not.toEqual(requests[2].selection);
  expect(requests.every((body) => body.exerciseId === null)).toBe(true);
});

test('Ask Lexora reserves a non-overlapping desktop rail across target widths', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {});

  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Classic', exact: true }).first().click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    const selectionTrigger = page.getByRole('button', {
      name: /Ask Lexora|Select a region of the source page/,
    });
    await selectionTrigger.click();
    const selectionLayer = page.locator('.page-selection-layer');
    const selectionBox = await selectionLayer.boundingBox();
    if (!selectionBox) throw new Error('Selection layer has no measurable page bounds');
    await page.mouse.move(selectionBox.x + selectionBox.width * 0.10, selectionBox.y + selectionBox.height * 0.20);
    await page.mouse.down();
    await page.mouse.move(selectionBox.x + selectionBox.width * 0.65, selectionBox.y + selectionBox.height * 0.34);
    await page.mouse.up();

    const panel = await page.getByRole('dialog', { name: 'Ask Lexora' }).boundingBox();
    const pageArea = await page.locator('.page-area').boundingBox();
    expect(panel).not.toBeNull();
    expect(pageArea).not.toBeNull();
    expect((pageArea?.x ?? 0) + (pageArea?.width ?? 0)).toBeLessThanOrEqual(panel?.x ?? 0);
  }
});

test('AI feedback is offered only for genuinely ungraded answers', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {
    check: { action: 'check', status: 'success', content: 'Looks plausible.', verdict: 'likely_correct', cached: false, siteKey: null, message: null },
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();

  // Advance from the fill-blank step to the free-text step.
  await page.locator('.lesson-step[data-kind="fill-blank"] input').fill('bin');
  await advanceToKind(page, 'free-text');

  // Free-text is genuinely ungraded: answer it, then AI feedback is offered.
  await page.locator('.lesson-step[data-kind="free-text"] textarea').fill('Am Morgen trinke ich Tee.');
  await openAskLexora(page);
  await page.getByRole('button', { name: 'Get AI feedback' }).click();
  await expect(page.getByText('Looks plausible.')).toBeVisible();
  await expect(page.getByText('AI-assisted feedback')).toBeVisible();
  await expect(page.getByText('Not source-backed · no automatic grade')).toBeVisible();

  // Back on the fill-blank step, the answer is source-backed: no AI feedback.
  await page.getByRole('button', { name: 'Try another action' }).click();
  await backToKind(page, 'fill-blank');
  await page.locator('.lesson-step[data-kind="fill-blank"] input').fill('bin');
  await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get AI feedback' })).toHaveCount(0);
});

test('shows a clean state when the provider is unavailable', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {
    hint: { action: 'hint', status: 'unavailable', content: null, verdict: null, cached: false, siteKey: null, message: null },
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await openAskLexora(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText(/temporarily unavailable/i)).toBeVisible();
});

test('shows a clean state when the daily limit is reached', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {
    hint: { action: 'hint', status: 'limit_reached', content: null, verdict: null, cached: false, siteKey: null, message: 'AI help is temporarily unavailable. Please try again later.' },
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await openAskLexora(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText(/try again later/i)).toBeVisible();
});

test('shows the Turnstile widget when verification is required', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: 'test-site-key' }, {
    hint: { action: 'hint', status: 'verification_required', content: null, verdict: null, cached: false, siteKey: 'test-site-key', message: null },
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await openAskLexora(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText(/verify you're human/i)).toBeVisible();
  await expect(page.locator('.cf-turnstile')).toBeVisible();
});

test('Ask Lexora panel has no axe WCAG A/AA violations', async ({ page }) => {
  await mockWorkbook(page);
  await mockAssist(page, { enabled: true, siteKey: null }, {
    hint: { action: 'hint', status: 'success', content: 'Think about the verb form.', verdict: null, cached: false, siteKey: null, message: null },
  });
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Satzbau', level: 1 })).toBeVisible();
  await openAskLexora(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText('Think about the verb form.')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
