import type { PageAnalysis } from '../reader/types';

export type PageProcessingStatus =
  | 'PENDING'
  | 'RASTERIZING'
  | 'OCR'
  | 'PERSISTING'
  | 'READY'
  | 'FAILED';

export interface BookPageResource {
  id: string;
  bookId: string;
  pageNumber: number;
  processingStatus: PageProcessingStatus;
  analysis: PageAnalysis | null;
  failureReason: string | null;
}

interface RawBookPage extends Omit<BookPageResource, 'analysis'> {
  analysis: string | null;
}

function parsePage(page: RawBookPage): BookPageResource {
  return {
    ...page,
    analysis: page.analysis ? JSON.parse(page.analysis) : null,
  };
}

export async function getBookPages(
  bookId: string,
  signal?: AbortSignal,
): Promise<BookPageResource[]> {
  const res = await fetch(`/api/books/${bookId}/pages`, { signal });
  if (!res.ok) throw new Error(`Loading pages failed: ${res.status}`);
  const pages: RawBookPage[] = await res.json();
  return pages.map(parsePage);
}

export async function processBookPage(
  bookId: string,
  pageNumber: number,
): Promise<BookPageResource> {
  const res = await fetch(`/api/books/${bookId}/pages/${pageNumber}/process`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Processing failed: ${res.status}`);
  return parsePage(await res.json());
}
