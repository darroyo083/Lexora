import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBookPage,
  getBookPages,
  getPageProcessAction,
  processBookPage,
} from '../client';

const textSpans = [{
  id: 'span-1',
  text: 'Wort',
  confidence: 0.98,
  confidenceScope: 'word',
  bbox: { x: 0.1, y: 0.2, width: 0.08, height: 0.02 },
}];

const rawPage = {
  id: 'page-id',
  bookId: 'book-id',
  pageNumber: 10,
  processingStatus: 'READY',
  analysis: JSON.stringify({ width: 1200, height: 1600, textSpans }),
  failureReason: null,
};

const currentAnalysisJson = JSON.stringify({
  schemaVersion: '0.2.0',
  pageNumber: 10,
  width: 1200,
  height: 1600,
  language: 'de',
  textSpans,
  exerciseBlanks: [],
  blankDetection: {},
  choiceGroups: [],
  choiceTargets: [],
  choiceDetection: {},
  choiceGrids: [],
  choiceGridDetection: {},
  sentenceOrderings: [],
  sentenceOrderingDetection: {},
  processor: {},
});

afterEach(() => vi.unstubAllGlobals());

describe('page API client', () => {
  it('loads and parses persisted pages without processing them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([rawPage]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pages = await getBookPages('book-id');

    expect(fetchMock).toHaveBeenCalledWith('/api/books/book-id/pages', { signal: undefined });
    expect(pages[0].processingStatus).toBe('READY');
    expect(pages[0].analysis?.textSpans).toHaveLength(1);
    expect(pages[0].analysis?.exerciseBlanks).toEqual([]);
    expect(pages[0].analysis?.schemaVersion).toBe('legacy');
    expect(pages[0].analysis?.width).toBe(1200);
    expect(pages[0].analysis?.height).toBe(1600);
    expect(pages[0].analysis?.textSpans).toEqual(textSpans);
  });

  it('keeps failed pages retryable without requiring analysis', async () => {
    const failed = { ...rawPage, processingStatus: 'FAILED', analysis: null, failureReason: 'OCR failed' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([failed]), { status: 200 }),
    ));

    const pages = await getBookPages('book-id');

    expect(pages[0].processingStatus).toBe('FAILED');
    expect(pages[0].analysis).toBeNull();
  });

  it('uses POST only for an explicit process request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(rawPage), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await processBookPage('book-id', 10);

    expect(fetchMock).toHaveBeenCalledWith('/api/books/book-id/pages/10/process', {
      method: 'POST',
      signal: undefined,
    });
  });

  it('refreshes a legacy READY analysis only after the explicit update action', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([rawPage]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rawPage), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const [legacy] = await getBookPages('book-id');

    expect(getPageProcessAction(legacy)).toBe('update');
    await processBookPage('book-id', 10, true);

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/books/book-id/pages/10/process?refreshAnalysis=true',
      { method: 'POST', signal: undefined },
    );
  });

  it('restores a current READY analysis without reprocessing on open', async () => {
    const currentPage = {
      ...rawPage,
      analysis: currentAnalysisJson,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([currentPage]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [restored] = await getBookPages('book-id');

    expect(restored.processingStatus).toBe('READY');
    expect(getPageProcessAction(restored)).toBe('update');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-analyzes a fully current READY page only after the explicit update action', async () => {
    const currentPage = {
      ...rawPage,
      analysis: currentAnalysisJson,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([currentPage]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(currentPage), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const [restored] = await getBookPages('book-id');

    expect(getPageProcessAction(restored)).toBe('update');
    await processBookPage('book-id', 10, true);

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/books/book-id/pages/10/process?refreshAnalysis=true',
      { method: 'POST', signal: undefined },
    );
  });

  it('hides the re-analyze action for a READY page without persisted analysis', async () => {
    const bareReady = { ...rawPage, analysis: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([bareReady]), { status: 200 }),
    ));

    const [restored] = await getBookPages('book-id');

    expect(restored.processingStatus).toBe('READY');
    expect(getPageProcessAction(restored)).toBe('none');
  });

  it('offers an explicit update for v0.2 pages without ordering analysis', async () => {
    const prePoc4Page = {
      ...rawPage,
      analysis: JSON.stringify({
        schemaVersion: '0.2.0',
        pageNumber: 10,
        width: 1200,
        height: 1600,
        language: 'de',
        textSpans,
        exerciseBlanks: [],
        blankDetection: {},
        choiceGroups: [],
        choiceTargets: [],
        choiceDetection: {},
        choiceGrids: [],
        choiceGridDetection: {},
        processor: {},
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([prePoc4Page]), { status: 200 }),
    ));

    const [restored] = await getBookPages('book-id');

    expect(getPageProcessAction(restored)).toBe('update');
  });

  it('normalizes missing choice fields to empty collections', async () => {
    const prePoc2Page = {
      ...rawPage,
      analysis: JSON.stringify({
        schemaVersion: '0.2.0',
        pageNumber: 10,
        width: 1200,
        height: 1600,
        language: 'de',
        textSpans,
        exerciseBlanks: [],
        blankDetection: {},
        processor: {},
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([prePoc2Page]), { status: 200 }),
    ));

    const [restored] = await getBookPages('book-id');

    expect(restored.analysis?.choiceTargets).toEqual([]);
    expect(restored.analysis?.choiceGroups).toEqual([]);
    expect(restored.analysis?.choiceDetection).toBeNull();
    expect(restored.analysis?.choiceGrids).toEqual([]);
    expect(restored.analysis?.choiceGridDetection).toBeNull();
    expect(restored.analysis?.freeTextInteractions).toEqual([]);
    expect(restored.analysis?.freeTextDetection).toBeNull();
  });

  it('normalizes free-text fields into the page analysis', async () => {
    const freeTextPage = {
      ...rawPage,
      analysis: JSON.stringify({
        schemaVersion: '0.2.0',
        pageNumber: 28,
        width: 2284,
        height: 3121,
        language: 'de',
        textSpans,
        exerciseBlanks: [],
        blankDetection: {},
        freeTextInteractions: [{
          id: 'free-text-28-1',
          kind: 'free-text',
          bbox: { x: 0.451, y: 0.572, width: 0.468, height: 0.216 },
          detectionMethod: 'free-text-v1',
          candidateScore: 0.93,
          nearbyTextSpanIds: ['span-1'],
          responseLines: [{
            id: 'free-text-28-1-line-1',
            bbox: { x: 0.451, y: 0.572, width: 0.468, height: 0.0013 },
          }],
        }],
        freeTextDetection: { detectionMethod: 'free-text-v1', rawCandidateCount: 1, acceptedCount: 1, groupCount: 1, durationMs: 88 },
        processor: {},
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([freeTextPage]), { status: 200 }),
    ));

    const [restored] = await getBookPages('book-id');

    expect(restored.analysis?.freeTextInteractions).toHaveLength(1);
    expect(restored.analysis?.freeTextInteractions[0].id).toBe('free-text-28-1');
    expect(restored.analysis?.freeTextInteractions[0].responseLines[0].id)
      .toBe('free-text-28-1-line-1');
    expect(restored.analysis?.freeTextDetection?.acceptedCount).toBe(1);
  });

  it('loads a single page resource from its dedicated endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(rawPage), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const page = await getBookPage('book-id', 10);

    expect(fetchMock).toHaveBeenCalledWith('/api/books/book-id/pages/10', { signal: undefined });
    expect(page.pageNumber).toBe(10);
    expect(page.processingStatus).toBe('READY');
    expect(page.analysis?.textSpans).toHaveLength(1);
  });

  it('surfaces the HTTP status for a missing single page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(null, { status: 404 }),
    ));

    const error = await getBookPage('book-id', 10).then(
      () => null,
      (caught: unknown) => caught as Error & { status?: number },
    );

    expect(error).not.toBeNull();
    expect(error?.status).toBe(404);
    expect(error?.message).toContain('404');
  });

  it('does not let one corrupted analysis JSON break the page list', async () => {
    const corrupted = { ...rawPage, pageNumber: 11, analysis: '{not json' };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([rawPage, corrupted]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pages = await getBookPages('book-id');

    expect(pages).toHaveLength(2);
    expect(pages[0].analysis?.textSpans).toHaveLength(1);
    expect(pages[1].processingStatus).toBe('READY');
    expect(pages[1].analysis).toBeNull();
  });
});
