import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBookPages, processBookPage } from '../client';

const rawPage = {
  id: 'page-id',
  bookId: 'book-id',
  pageNumber: 10,
  processingStatus: 'READY',
  analysis: JSON.stringify({ textSpans: [{ id: 'span-1' }] }),
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

    expect(fetchMock).toHaveBeenCalledWith('/api/books/book-id/pages/10/process', { method: 'POST' });
  });
});
