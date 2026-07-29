import type { PageAnalysis } from '../reader/types';

const BASE = '';

export async function fetchPageAnalysis(
  bookId: string,
  pageNumber: number
): Promise<PageAnalysis> {
  const res = await fetch(
    `${BASE}/api/books/${bookId}/pages/${pageNumber}/process`,
    { method: 'POST' }
  );
  if (!res.ok) {
    throw new Error(`Processing failed: ${res.status}`);
  }
  const page = await res.json();
  const analysis = JSON.parse(page.analysis);
  return analysis;
}
