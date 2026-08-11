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
  unitTitle: string | null;
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

function normalizeTypedPayload(payload: unknown): TypedPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  if (value.type === 'Text' && typeof value.value === 'string') {
    return {
      kind: 'text',
      value: value.value,
      alternatives: Array.isArray(value.alternatives)
        ? value.alternatives.filter((item): item is string => typeof item === 'string')
        : [],
    };
  }
  if (value.type === 'Matching' && Array.isArray(value.pairs)) {
    const pairs = value.pairs.filter((pair): pair is { leftLabel: string; rightLabel: string } => (
      Boolean(pair)
      && typeof pair === 'object'
      && typeof (pair as Record<string, unknown>).leftLabel === 'string'
      && typeof (pair as Record<string, unknown>).rightLabel === 'string'
    ));
    return { kind: 'matching', pairs };
  }
  if (value.type === 'Reference' && typeof value.modelText === 'string') {
    return {
      kind: 'reference',
      modelText: value.modelText,
      sourceHint: typeof value.sourceHint === 'string' ? value.sourceHint : '',
    };
  }
  if ('kind' in value) return payload as TypedPayload;
  return null;
}

function normalizeEntry(entry: AnswerKeyEntry): AnswerKeyEntry {
  return { ...entry, typedPayload: normalizeTypedPayload(entry.typedPayload) };
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
  const answerKey = await res.json() as AnswerKey;
  return { ...answerKey, entries: answerKey.entries.map(normalizeEntry) };
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
  const answerKey = await res.json() as AnswerKey;
  return { ...answerKey, entries: answerKey.entries.map(normalizeEntry) };
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
  const correction = await res.json() as PageCorrectionResolution;
  return {
    ...correction,
    slots: correction.slots.map((slot) => ({
      ...slot,
      entry: slot.entry ? normalizeEntry(slot.entry) : null,
    })),
  };
}
