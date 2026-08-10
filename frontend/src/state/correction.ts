import type {
  ExerciseBlank,
  ChoiceTarget,
  ChoiceGrid,
  SentenceOrderingInteraction,
  MatchingInteraction,
  FreeTextInteraction,
} from '../reader/types';

export enum CorrectionVerdict {
  CORRECT = 'CORRECT',
  INCORRECT = 'INCORRECT',
  PARTIALLY_CORRECT = 'PARTIALLY_CORRECT',
  UNANSWERED = 'UNANSWERED',
  NOT_AUTO_GRADABLE = 'NOT_AUTO_GRADABLE',
}

export enum AnswerResolutionStatus {
  RESOLVED = 'RESOLVED',
  MISSING = 'MISSING',
  UNMAPPED = 'UNMAPPED',
  AMBIGUOUS = 'AMBIGUOUS',
  EXTRACTION_UNCERTAIN = 'EXTRACTION_UNCERTAIN',
}

export type UICorrectionState = 'IDLE' | 'CHECKING' | 'CHECKED' | 'REVEALED' | 'RETRYING';

export interface CorrectionResult {
  verdict: CorrectionVerdict | undefined;
  resolution: AnswerResolutionStatus;
  details?: {
    correctCount?: number;
    totalCount?: number;
  };
}

export interface CorrectionState {
  verdictByItem: Record<string, CorrectionVerdict | undefined>;
  resolutionByItem: Record<string, AnswerResolutionStatus>;
  resultDetailsByItem: Record<string, { correctCount: number; totalCount: number }>;
  uiState: UICorrectionState;
  reveal: Record<string, boolean>;
}

export const CORRECTION_REVEAL_KEY = 'lexora.correctionReveal.v1';
export const CORRECTION_REVEAL_VERSION = 1;

export interface RevealStore {
  version: 1;
  reveals: Record<string, Record<string, Record<string, boolean>>>;
}

export function emptyCorrectionState(): CorrectionState {
  return {
    verdictByItem: {},
    resolutionByItem: {},
    resultDetailsByItem: {},
    uiState: 'IDLE',
    reveal: {},
  };
}

export function correctionUIState(
  _verdictByItem: Record<string, CorrectionVerdict | undefined>,
  _reveal: Record<string, boolean>,
  _itemIds: string[],
): UICorrectionState {
  if (_itemIds.length === 0) return 'IDLE';
  const hasVerdicts = _itemIds.some((id) => _verdictByItem[id] !== undefined);
  if (!hasVerdicts) return 'IDLE';
  return 'CHECKED';
}

export function hasAnyVerdict(
  verdictByItem: Record<string, CorrectionVerdict | undefined>,
  itemIds: string[],
): boolean {
  return itemIds.some((id) => verdictByItem[id] !== undefined);
}

export function emptyRevealStore(): RevealStore {
  return { version: CORRECTION_REVEAL_VERSION, reveals: {} };
}

export function loadRevealStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): RevealStore {
  try {
    const raw = storage.getItem(CORRECTION_REVEAL_KEY);
    if (!raw) return emptyRevealStore();
    const parsed = JSON.parse(raw) as RevealStore;
    if (parsed?.version !== CORRECTION_REVEAL_VERSION || !parsed?.reveals) {
      return emptyRevealStore();
    }
    return parsed;
  } catch {
    return emptyRevealStore();
  }
}

export function readRevealBitsForPage(
  bookId: string,
  pageNumber: number,
  blanks: ExerciseBlank[],
  choices: ChoiceTarget[],
  grids: ChoiceGrid[],
  sentenceOrderings: SentenceOrderingInteraction[],
  matchings: MatchingInteraction[],
  freeTexts: FreeTextInteraction[],
  _schemaVersion: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Record<string, boolean> {
  const store = loadRevealStore(storage);
  const byPage = store.reveals[bookId]?.[String(pageNumber)];
  if (!byPage) return {};

  const blankIds = new Set(blanks.map((b) => b.id));
  const choiceIds = new Set(choices.map((c) => c.id));
  const gridIds = new Set(grids.map((g) => g.id));
  const gridRowIds = new Set(grids.flatMap((g) => g.rows.map((r) => r.id)));
  const orderingIds = new Set(sentenceOrderings.map((o) => o.id));
  const matchingIds = new Set(matchings.map((m) => m.id));
  const freeTextIds = new Set(freeTexts.map((f) => f.id));

  const result: Record<string, boolean> = {};
  for (const [id, revealed] of Object.entries(byPage)) {
    if (
      blankIds.has(id) || choiceIds.has(id) || gridIds.has(id) || gridRowIds.has(id) ||
      orderingIds.has(id) || matchingIds.has(id) || freeTextIds.has(id)
    ) {
      if (revealed) result[id] = true;
    }
  }
  return result;
}

export function writeRevealBit(
  bookId: string,
  pageNumber: number,
  itemId: string,
  revealed: boolean,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  const store = loadRevealStore(storage);
  const book = { ...(store.reveals[bookId] ?? {}) };
  const page = { ...(book[String(pageNumber)] ?? {}) };
  if (revealed) {
    page[itemId] = true;
  } else {
    delete page[itemId];
  }
  if (Object.keys(page).length === 0) {
    delete book[String(pageNumber)];
  } else {
    book[String(pageNumber)] = page;
  }
  if (Object.keys(book).length === 0) {
    delete store.reveals[bookId];
  } else {
    store.reveals[bookId] = book;
  }
  storage.setItem(CORRECTION_REVEAL_KEY, JSON.stringify(store));
}
