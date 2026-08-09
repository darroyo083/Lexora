export type ExtractionStatus = 'PENDING' | 'READY' | 'FAILED';

export interface TextExpectedAnswer {
  kind: 'text';
  value: string;
  alternatives: string[];
}

export interface MatchingExpectedAnswer {
  kind: 'matching';
  pairs: Array<{ leftLabel: string; rightLabel: string }>;
}

export interface ReferenceExpectedAnswer {
  kind: 'reference';
  modelText: string;
  sourceHint: string;
}

export type TypedPayload =
  | TextExpectedAnswer
  | MatchingExpectedAnswer
  | ReferenceExpectedAnswer;

export type CorrectionInteractionKind =
  | 'fill-in-line'
  | 'choice'
  | 'choice-grid'
  | 'sentence-ordering'
  | 'matching'
  | 'free-text';

export interface AnswerKeyEntry {
  pageNumber: number;
  exerciseNumber?: number | null;
  unitNumber?: number | null;
  subExerciseMarker?: string | null;
  items?: string[] | null;
  interactionKind: CorrectionInteractionKind;
  ordinal: number;
  expectedValue: string;
  alternatives: string[];
  caseSensitive: boolean;
  punctuationRequired: boolean;
  normalizationMode: 'strict';
  rawSolutionText: string;
  confidence: number;
  mappingWarnings: string[];
  typedPayload?: TypedPayload | null;
}

export type SlotResolution = 'RESOLVED' | 'AMBIGUOUS' | 'UNMAPPED';
export type PageCorrectionStatus = 'RESOLVED' | 'AMBIGUOUS' | 'UNMAPPED';

export interface CorrectionSlot {
  interactionKind: CorrectionInteractionKind;
  ordinal: number;
  resolution: SlotResolution;
  entry: AnswerKeyEntry | null;
}

export interface PageCorrectionResolution {
  bookId: string;
  pageNumber: number;
  unitNumber: number | null;
  status: PageCorrectionStatus;
  slots: CorrectionSlot[];
}

export interface AnswerKey {
  id: string;
  bookId: string;
  extractionMethod: string;
  parserVersion: string;
  sourcePageRange: string;
  extractionStatus: ExtractionStatus;
  failureReason: string | null;
  extractedAt: string | null;
  entryCount: number;
  entries: AnswerKeyEntry[];
}

export async function fetchAnswerKey(
  bookId: string,
  signal?: AbortSignal,
): Promise<AnswerKey> {
  const res = await fetch(`/api/books/${bookId}/answer-key`, { signal });
  if (!res.ok) {
    const error = new Error(`Answer key not found: ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function extractAnswerKey(
  bookId: string,
  refresh = false,
  signal?: AbortSignal,
): Promise<AnswerKey> {
  const query = refresh ? '?refresh=true' : '';
  const res = await fetch(`/api/books/${bookId}/answer-key/extract${query}`, {
    method: 'POST',
    signal,
  });
  if (!res.ok) throw new Error(`Answer key extraction failed: ${res.status}`);
  return res.json();
}

export async function fetchPageCorrection(
  bookId: string,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<PageCorrectionResolution> {
  const res = await fetch(
    `/api/books/${bookId}/pages/${pageNumber}/correction`,
    { signal },
  );
  if (!res.ok) throw new Error(`Correction resolution failed: ${res.status}`);
  return res.json();
}
