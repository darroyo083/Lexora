import type { ChoiceGrid, ChoiceGridRow, ChoiceTarget, ExerciseBlank, FreeTextInteraction, MatchingInteraction, SentenceOrderingInteraction } from '../reader/types';

export const EXERCISE_ANSWERS_KEY = 'lexora.exerciseAnswers.v1';
export const EXERCISE_ANSWERS_VERSION = 1;

export interface StoredAnswer {
  fingerprint: string;
  kind: 'fill-blank' | 'choice' | 'choice-grid' | 'sentence-ordering' | 'matching' | 'free-text';
  value: string;
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

export function choiceFingerprint(target: ChoiceTarget, schemaVersion: string): string {
  return [
    schemaVersion,
    target.detectionMethod,
    target.targetBbox.x.toFixed(4),
    target.targetBbox.y.toFixed(4),
    target.targetBbox.width.toFixed(4),
    target.targetBbox.height.toFixed(4),
    target.optionGroupId ?? '',
  ].join('|');
}

export function gridRowFingerprint(
  grid: ChoiceGrid,
  row: ChoiceGridRow,
  schemaVersion: string,
): string {
  return [
    schemaVersion,
    grid.detectionMethod,
    grid.optionGroupId,
    row.rowBbox.x.toFixed(4),
    row.rowBbox.y.toFixed(4),
    row.rowBbox.width.toFixed(4),
    row.rowBbox.height.toFixed(4),
  ].join('|');
}

export function sentenceOrderingFingerprint(
  interaction: SentenceOrderingInteraction,
  schemaVersion: string,
): string {
  return [
    schemaVersion,
    interaction.detectionMethod,
    interaction.bbox.x.toFixed(4),
    interaction.bbox.y.toFixed(4),
    interaction.bbox.width.toFixed(4),
    interaction.bbox.height.toFixed(4),
    String(interaction.items.length),
  ].join('|');
}

export function matchingFingerprint(
  interaction: MatchingInteraction,
  schemaVersion: string,
): string {
  return [
    schemaVersion,
    interaction.detectionMethod,
    interaction.bbox.x.toFixed(4),
    interaction.bbox.y.toFixed(4),
    interaction.bbox.width.toFixed(4),
    interaction.bbox.height.toFixed(4),
    String(interaction.leftItems.length),
    String(interaction.rightItems.length),
  ].join('|');
}

export function freeTextFingerprint(
  interaction: FreeTextInteraction,
  schemaVersion: string,
): string {
  return [
    schemaVersion,
    interaction.detectionMethod,
    interaction.bbox.x.toFixed(4),
    interaction.bbox.y.toFixed(4),
    interaction.bbox.width.toFixed(4),
    interaction.bbox.height.toFixed(4),
    String(interaction.responseLines.length),
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

function findAnswersByPage(
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
  choices: ChoiceTarget[],
  grids: ChoiceGrid[],
  sentenceOrderings: SentenceOrderingInteraction[],
  matchings: MatchingInteraction[],
  freeTexts: FreeTextInteraction[],
  schemaVersion: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Record<string, string> {
  const store = loadAnswerStore(storage);
  const byPage = findAnswersByPage(store, bookId, pageNumber);
  if (!byPage) return {};
  const blankIds = new Map(blanks.map((blank) => [blank.id, blank]));
  const choiceIds = new Map(choices.map((choice) => [choice.id, choice]));
  const gridRows = new Map(
    grids.flatMap((grid) => grid.rows.map((row) => [row.id, { grid, row } as const])),
  );
  const orderingIds = new Map(sentenceOrderings.map((o) => [o.id, o]));
  const matchingIds = new Map(matchings.map((m) => [m.id, m]));
  const freeTextIds = new Map(freeTexts.map((f) => [f.id, f]));
  const result: Record<string, string> = {};
  for (const [interactionId, stored] of Object.entries(byPage)) {
    const blank = blankIds.get(interactionId);
    if (blank) {
      if (stored.fingerprint !== blankFingerprint(blank, schemaVersion)) continue;
      const legacy = stored as StoredAnswer & { text?: string };
      result[interactionId] = stored.kind === 'choice'
        ? stored.value
        : legacy.text ?? stored.value;
      continue;
    }
    const choice = choiceIds.get(interactionId);
    if (choice) {
      if (stored.fingerprint !== choiceFingerprint(choice, schemaVersion)) continue;
      if (stored.kind === 'choice') result[interactionId] = stored.value;
      continue;
    }
    const gridRow = gridRows.get(interactionId);
    if (gridRow) {
      if (stored.fingerprint !== gridRowFingerprint(gridRow.grid, gridRow.row, schemaVersion)) {
        continue;
      }
      if (stored.kind === 'choice-grid') result[interactionId] = stored.value;
      continue;
    }
    const ordering = orderingIds.get(interactionId);
    if (ordering) {
      if (stored.fingerprint !== sentenceOrderingFingerprint(ordering, schemaVersion)) {
        continue;
      }
      if (stored.kind === 'sentence-ordering') result[interactionId] = stored.value;
      continue;
    }
    const matching = matchingIds.get(interactionId);
    if (matching) {
      if (stored.fingerprint !== matchingFingerprint(matching, schemaVersion)) {
        continue;
      }
      if (stored.kind === 'matching') result[interactionId] = stored.value;
      continue;
    }
    const freeText = freeTextIds.get(interactionId);
    if (freeText) {
      if (stored.fingerprint !== freeTextFingerprint(freeText, schemaVersion)) continue;
      if (stored.kind === 'free-text') result[interactionId] = stored.value;
    }
  }
  return result;
}

export function writeAnswersForPage(
  bookId: string,
  pageNumber: number,
  answers: Record<string, string>,
  blanks: ExerciseBlank[],
  choices: ChoiceTarget[],
  grids: ChoiceGrid[],
  sentenceOrderings: SentenceOrderingInteraction[],
  matchings: MatchingInteraction[],
  freeTexts: FreeTextInteraction[],
  schemaVersion: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  const store = loadAnswerStore(storage);
  const blanksById = new Map(blanks.map((blank) => [blank.id, blank]));
  const choicesById = new Map(choices.map((choice) => [choice.id, choice]));
  const gridRowsById = new Map(
    grids.flatMap((grid) => grid.rows.map((row) => [row.id, { grid, row } as const])),
  );
  const orderingsById = new Map(sentenceOrderings.map((o) => [o.id, o]));
  const matchingsById = new Map(matchings.map((m) => [m.id, m]));
  const freeTextsById = new Map(freeTexts.map((f) => [f.id, f]));
  const nextPage: PageAnswers = {};
  const previous = findAnswersByPage(store, bookId, pageNumber) ?? {};
  const ids = new Set([
    ...Object.keys(previous),
    ...Object.keys(answers),
  ]);
  for (const interactionId of ids) {
    const value = answers[interactionId];
    if (!value) continue;
    const blank = blanksById.get(interactionId);
    if (blank) {
      nextPage[interactionId] = {
        fingerprint: blankFingerprint(blank, schemaVersion),
        kind: 'fill-blank',
        value,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }
    const choice = choicesById.get(interactionId);
    if (choice) {
      nextPage[interactionId] = {
        fingerprint: choiceFingerprint(choice, schemaVersion),
        kind: 'choice',
        value,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }
    const gridRow = gridRowsById.get(interactionId);
    if (gridRow) {
      nextPage[interactionId] = {
        fingerprint: gridRowFingerprint(gridRow.grid, gridRow.row, schemaVersion),
        kind: 'choice-grid',
        value,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }
    const ordering = orderingsById.get(interactionId);
    if (ordering) {
      nextPage[interactionId] = {
        fingerprint: sentenceOrderingFingerprint(ordering, schemaVersion),
        kind: 'sentence-ordering',
        value,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }
    const matching = matchingsById.get(interactionId);
    if (matching) {
      nextPage[interactionId] = {
        fingerprint: matchingFingerprint(matching, schemaVersion),
        kind: 'matching',
        value,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }
    const freeText = freeTextsById.get(interactionId);
    if (freeText) {
      nextPage[interactionId] = {
        fingerprint: freeTextFingerprint(freeText, schemaVersion),
        kind: 'free-text',
        value,
        updatedAt: new Date().toISOString(),
      };
    }
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
