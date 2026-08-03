import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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

  it('restores a current READY analysis without requesting processing', async () => {
    const currentPage = {
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
        processor: {},
      }),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([currentPage]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [restored] = await getBookPages('book-id');

    expect(getPageProcessAction(restored)).toBe('none');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit update for v0.2 pages without choice analysis', async () => {
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
  });
});
