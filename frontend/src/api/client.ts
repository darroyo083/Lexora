import type { PageAnalysis } from '../reader/types';

export type PageProcessingStatus =
  | 'PENDING'
  | 'RASTERIZING'
  | 'OCR'
  | 'DETECTING_INTERACTIONS'
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

export function normalizePageAnalysis(value: unknown): PageAnalysis {
  const analysis = value as Partial<PageAnalysis> & {
    dimensions?: { sourceWidth?: number; sourceHeight?: number };
  };

  return {
    ...analysis,
    schemaVersion: typeof analysis.schemaVersion === 'string'
      ? analysis.schemaVersion
      : 'legacy',
    pageNumber: Number(analysis.pageNumber ?? 0),
    width: Number(analysis.width ?? analysis.dimensions?.sourceWidth ?? 0),
    height: Number(analysis.height ?? analysis.dimensions?.sourceHeight ?? 0),
    language: typeof analysis.language === 'string' ? analysis.language : '',
    textSpans: Array.isArray(analysis.textSpans) ? analysis.textSpans : [],
    exerciseBlanks: Array.isArray(analysis.exerciseBlanks) ? analysis.exerciseBlanks : [],
    blankDetection: analysis.blankDetection ?? null,
    choiceGroups: Array.isArray(analysis.choiceGroups) ? analysis.choiceGroups : [],
    choiceTargets: Array.isArray(analysis.choiceTargets) ? analysis.choiceTargets : [],
    choiceDetection: analysis.choiceDetection ?? null,
    choiceGrids: Array.isArray(analysis.choiceGrids) ? analysis.choiceGrids : [],
    choiceGridDetection: analysis.choiceGridDetection ?? null,
    sentenceOrderings: Array.isArray(analysis.sentenceOrderings) ? analysis.sentenceOrderings : [],
    sentenceOrderingDetection: analysis.sentenceOrderingDetection ?? null,
    processor: analysis.processor as PageAnalysis['processor'],
  };
}

export function parsePage(page: RawBookPage): BookPageResource {
  let analysis: PageAnalysis | null = null;
  if (page.analysis) {
    try {
      analysis = normalizePageAnalysis(JSON.parse(page.analysis));
    } catch {
      console.warn(
        `Unparseable analysis for page ${page.pageNumber} of book ${page.bookId}; treating it as absent`,
      );
    }
  }
  return { ...page, analysis };
}

export type PageProcessAction = 'process' | 'update' | 'none';

export function getPageProcessAction(page: BookPageResource | null): PageProcessAction {
  if (page?.processingStatus !== 'READY') return 'process';
  if (page.analysis === null) return 'none';
  return 'update';
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

export async function getBookPage(
  bookId: string,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<BookPageResource> {
  const res = await fetch(`/api/books/${bookId}/pages/${pageNumber}`, { signal });
  if (!res.ok) {
    const error = new Error(`Loading page failed: ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return parsePage(await (res.json() as Promise<RawBookPage>));
}

export async function processBookPage(
  bookId: string,
  pageNumber: number,
  refreshAnalysis = false,
  signal?: AbortSignal,
): Promise<BookPageResource> {
  const refresh = refreshAnalysis ? '?refreshAnalysis=true' : '';
  const res = await fetch(`/api/books/${bookId}/pages/${pageNumber}/process${refresh}`, {
    method: 'POST',
    signal,
  });
  if (!res.ok) throw new Error(`Processing failed: ${res.status}`);
  return parsePage(await res.json());
}
