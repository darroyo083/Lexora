import type { ExerciseBlank } from '../reader/types';

export const EXERCISE_ANSWERS_KEY = 'lexora.exerciseAnswers.v1';
export const EXERCISE_ANSWERS_VERSION = 1;

export interface StoredAnswer {
  fingerprint: string;
  text: string;
  updatedAt: string;
}

export interface AnswerStore {
  version: 1;
  answers: Record<string, Record<string, Record<string, StoredAnswer>>>;
}

type PageAnswers = Record<string, StoredAnswer>;

export function emptyAnswerStore(): AnswerStore {
  return { version: EXERCISE_ANSWERS_VERSION, answers: {} };
}

export function blankFingerprint(blank: ExerciseBlank, schemaVersion: string): string {
  return [
    schemaVersion,
    blank.detectionMethod,
    blank.lineBbox.x.toFixed(4),
    blank.lineBbox.y.toFixed(4),
    blank.lineBbox.width.toFixed(4),
    blank.lineBbox.height.toFixed(4),
  ].join('|');
}

export function loadAnswerStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): AnswerStore {
  try {
    const raw = storage.getItem(EXERCISE_ANSWERS_KEY);
    if (!raw) return emptyAnswerStore();
    const parsed = JSON.parse(raw) as AnswerStore;
    if (parsed?.version !== EXERCISE_ANSWERS_VERSION || !parsed?.answers) {
      return emptyAnswerStore();
    }
    return parsed;
  } catch {
    return emptyAnswerStore();
  }
}

function findBlanksByPage(
  store: AnswerStore,
  bookId: string,
  pageNumber: number,
): PageAnswers | undefined {
  return store.answers[bookId]?.[String(pageNumber)];
}

export function readAnswersForPage(
  bookId: string,
  pageNumber: number,
  blanks: ExerciseBlank[],
  schemaVersion: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Record<string, string> {
  const store = loadAnswerStore(storage);
  const byPage = findBlanksByPage(store, bookId, pageNumber);
  if (!byPage) return {};
  const current = new Map(blanks.map((blank) => [blank.id, blank]));
  const result: Record<string, string> = {};
  for (const [blankId, stored] of Object.entries(byPage)) {
    const blank = current.get(blankId);
    if (!blank) continue;
    if (stored.fingerprint !== blankFingerprint(blank, schemaVersion)) continue;
    result[blankId] = stored.text;
  }
  return result;
}

export function writeAnswersForPage(
  bookId: string,
  pageNumber: number,
  answers: Record<string, string>,
  blanks: ExerciseBlank[],
  schemaVersion: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  const store = loadAnswerStore(storage);
  const current = new Map(blanks.map((blank) => [blank.id, blank]));
  const nextPage: PageAnswers = {};
  const ids = new Set([...Object.keys(findBlanksByPage(store, bookId, pageNumber) ?? {}), ...Object.keys(answers)]);
  for (const blankId of ids) {
    const text = answers[blankId];
    if (!text) continue;
    const blank = current.get(blankId);
    if (!blank) continue;
    nextPage[blankId] = {
      fingerprint: blankFingerprint(blank, schemaVersion),
      text,
      updatedAt: new Date().toISOString(),
    };
  }
  const book = { ...(store.answers[bookId] ?? {}) };
  if (Object.keys(nextPage).length === 0) {
    delete book[String(pageNumber)];
  } else {
    book[String(pageNumber)] = nextPage;
  }
  store.answers[bookId] = book;
  storage.setItem(EXERCISE_ANSWERS_KEY, JSON.stringify(store));
}
