import { describe, expect, it, beforeEach } from 'vitest';
import {
  blankFingerprint,
  choiceFingerprint,
  emptyAnswerStore,
  gridRowFingerprint,
  loadAnswerStore,
  readAnswersForPage,
  writeAnswersForPage,
} from '../exerciseAnswers';
import type { ChoiceGrid, ChoiceGridRow, ChoiceTarget, ExerciseBlank } from '../../reader/types';

const SCHEMA = '0.2.0';

function blank(id: string, x: number, y: number, width: number): ExerciseBlank {
  return {
    id,
    kind: 'fill-in-line',
    lineBbox: { x, y, width, height: 0.001 },
    interactionBbox: { x, y: y - 0.004, width, height: 0.018 },
    detectionMethod: 'horizontal-line-v1',
    candidateScore: 0.9,
    nearbyTextSpanIds: [],
  };
}

function choice(id: string, x: number, y: number, group = 'group-1'): ChoiceTarget {
  return {
    id,
    kind: 'choice',
    targetBbox: { x, y, width: 0.03, height: 0.03 },
    interactionBbox: { x: x - 0.01, y: y - 0.01, width: 0.05, height: 0.05 },
    optionGroupId: group,
    detectionMethod: 'empty-ring-v1',
    candidateScore: 0.95,
    nearbyTextSpanIds: [],
  };
}

function gridRow(id: string, y: number): ChoiceGridRow {
  return {
    id,
    rowBbox: { x: 0.2, y, width: 0.6, height: 0.04 },
    promptBbox: { x: 0.2, y, width: 0.3, height: 0.02 },
    nearbyTextSpanIds: [],
    cells: [],
  };
}

function grid(id: string, rows: ChoiceGridRow[]): ChoiceGrid {
  return {
    id,
    kind: 'choice-grid',
    gridBbox: { x: 0.2, y: 0.3, width: 0.6, height: 0.2 },
    optionGroupId: 'grid-group-1',
    detectionMethod: 'table-grid-v1',
    candidateScore: 0.9,
    rows,
  };
}

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  raw(): string | null {
    return this.data.get('lexora.exerciseAnswers.v1') ?? null;
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('exercise answer persistence', () => {
  it('persists and restores answers for a page (refresh-style initialization)', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1), blank('blank-2', 0.5, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, [], [], SCHEMA, storage);

    const restored = readAnswersForPage('book-a', 11, blanks, [], [], SCHEMA, storage);

    expect(restored).toEqual({ 'blank-1': 'ist' });
  });

  it('persists and restores choice answers keyed by choice id', () => {
    const choices = [choice('choice-1', 0.2, 0.3), choice('choice-2', 0.5, 0.3)];
    writeAnswersForPage(
      'book-a',
      16,
      { 'choice-1': 'group-1-2' },
      [],
      choices,
      [],
      SCHEMA,
      storage,
    );

    const restored = readAnswersForPage('book-a', 16, [], choices, [], SCHEMA, storage);

    expect(restored).toEqual({ 'choice-1': 'group-1-2' });
  });

  it('persists and restores choice-grid answers keyed by row id', () => {
    const grids = [grid('grid-1', [gridRow('grid-1-row-1', 0.4), gridRow('grid-1-row-2', 0.45)])];
    writeAnswersForPage(
      'book-a',
      29,
      { 'grid-1-row-1': 'grid-group-1-ja', 'grid-1-row-2': 'grid-group-1-doch' },
      [],
      [],
      grids,
      SCHEMA,
      storage,
    );

    const restored = readAnswersForPage('book-a', 29, [], [], grids, SCHEMA, storage);

    expect(restored).toEqual({
      'grid-1-row-1': 'grid-group-1-ja',
      'grid-1-row-2': 'grid-group-1-doch',
    });
  });

  it('keeps choice-grid answers isolated by book', () => {
    const grids = [grid('grid-1', [gridRow('grid-1-row-1', 0.4)])];
    writeAnswersForPage('book-a', 29, { 'grid-1-row-1': 'grid-group-1-ja' }, [], [], grids, SCHEMA, storage);

    expect(readAnswersForPage('book-b', 29, [], [], grids, SCHEMA, storage)).toEqual({});
    expect(readAnswersForPage('book-a', 29, [], [], grids, SCHEMA, storage))
      .toEqual({ 'grid-1-row-1': 'grid-group-1-ja' });
  });

  it('keeps choice-grid answers isolated by page', () => {
    const grids = [grid('grid-1', [gridRow('grid-1-row-1', 0.4)])];
    writeAnswersForPage('book-a', 29, { 'grid-1-row-1': 'grid-group-1-ja' }, [], [], grids, SCHEMA, storage);
    writeAnswersForPage('book-a', 30, { 'grid-1-row-1': 'grid-group-1-doch' }, [], [], grids, SCHEMA, storage);

    expect(readAnswersForPage('book-a', 29, [], [], grids, SCHEMA, storage))
      .toEqual({ 'grid-1-row-1': 'grid-group-1-ja' });
    expect(readAnswersForPage('book-a', 30, [], [], grids, SCHEMA, storage))
      .toEqual({ 'grid-1-row-1': 'grid-group-1-doch' });
  });

  it('keeps answers isolated by book', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, [], [], SCHEMA, storage);

    expect(readAnswersForPage('book-b', 11, blanks, [], [], SCHEMA, storage)).toEqual({});
    expect(readAnswersForPage('book-a', 11, blanks, [], [], SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
  });

  it('keeps answers isolated by page', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, [], [], SCHEMA, storage);
    writeAnswersForPage('book-a', 12, { 'blank-1': 'gehst' }, blanks, [], [], SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, [], [], SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
    expect(readAnswersForPage('book-a', 12, blanks, [], [], SCHEMA, storage)).toEqual({ 'blank-1': 'gehst' });
  });

  it('keys answers by stable blank id, not order', () => {
    const first = [blank('blank-1', 0.2, 0.3, 0.1), blank('blank-2', 0.5, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist', 'blank-2': 'sind' }, first, [], [], SCHEMA, storage);

    const reordered = [first[1], first[0]];
    expect(readAnswersForPage('book-a', 11, reordered, [], [], SCHEMA, storage)).toEqual({
      'blank-1': 'ist',
      'blank-2': 'sind',
    });
  });

  it('ignores stale blank answers when the blank geometry changes after reprocessing', () => {
    const before = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, before, [], [], SCHEMA, storage);

    const after = [blank('blank-1', 0.2, 0.42, 0.1)];
    expect(readAnswersForPage('book-a', 11, after, [], [], SCHEMA, storage)).toEqual({});
  });

  it('ignores stale choice answers when the target geometry changes after reprocessing', () => {
    const before = [choice('choice-1', 0.2, 0.3)];
    writeAnswersForPage('book-a', 16, { 'choice-1': 'group-1-2' }, [], before, [], SCHEMA, storage);

    const after = [choice('choice-1', 0.2, 0.42)];
    expect(readAnswersForPage('book-a', 16, [], after, [], SCHEMA, storage)).toEqual({});
  });

  it('ignores stale choice-grid answers when the row geometry changes after reprocessing', () => {
    const before = [grid('grid-1', [gridRow('grid-1-row-1', 0.4)])];
    writeAnswersForPage('book-a', 29, { 'grid-1-row-1': 'grid-group-1-ja' }, [], [], before, SCHEMA, storage);

    const after = [grid('grid-1', [gridRow('grid-1-row-1', 0.42)])];
    expect(readAnswersForPage('book-a', 29, [], [], after, SCHEMA, storage)).toEqual({});
  });

  it('ignores stale choice-grid answers when the option group changes', () => {
    const before = [grid('grid-1', [gridRow('grid-1-row-1', 0.4)])];
    writeAnswersForPage('book-a', 29, { 'grid-1-row-1': 'grid-group-1-ja' }, [], [], before, SCHEMA, storage);

    const after: ChoiceGrid[] = [{
      ...before[0],
      optionGroupId: 'grid-group-2',
    }];
    expect(readAnswersForPage('book-a', 29, [], [], after, SCHEMA, storage)).toEqual({});
  });

  it('ignores stale answers when the schema version changes', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, [], [], '0.2.0', storage);

    expect(readAnswersForPage('book-a', 11, blanks, [], [], '0.3.0', storage)).toEqual({});
  });

  it('ignores stored answers whose blank id no longer exists', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist', 'ghost': 'lost' }, blanks, [], [], SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, [], [], SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
  });

  it('ignores stored answers whose choice id no longer exists', () => {
    const choices = [choice('choice-1', 0.2, 0.3)];
    writeAnswersForPage('book-a', 16, { 'choice-1': 'group-1-1', 'ghost': 'x' }, [], choices, [], SCHEMA, storage);

    expect(readAnswersForPage('book-a', 16, [], choices, [], SCHEMA, storage)).toEqual({ 'choice-1': 'group-1-1' });
  });

  it('ignores stored answers whose grid row no longer exists', () => {
    const grids = [grid('grid-1', [gridRow('grid-1-row-1', 0.4)])];
    writeAnswersForPage('book-a', 29, { 'grid-1-row-1': 'grid-group-1-ja', 'ghost': 'x' }, [], [], grids, SCHEMA, storage);

    expect(readAnswersForPage('book-a', 29, [], [], grids, SCHEMA, storage))
      .toEqual({ 'grid-1-row-1': 'grid-group-1-ja' });
  });

  it('drops cleared answers instead of restoring them', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, [], [], SCHEMA, storage);
    writeAnswersForPage('book-a', 11, { 'blank-1': '' }, blanks, [], [], SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, [], [], SCHEMA, storage)).toEqual({});
  });

  it('drops cleared choice answers instead of restoring them', () => {
    const choices = [choice('choice-1', 0.2, 0.3)];
    writeAnswersForPage('book-a', 16, { 'choice-1': 'group-1-2' }, [], choices, [], SCHEMA, storage);
    writeAnswersForPage('book-a', 16, { 'choice-1': '' }, [], choices, [], SCHEMA, storage);

    expect(readAnswersForPage('book-a', 16, [], choices, [], SCHEMA, storage)).toEqual({});
  });

  it('keeps blank, choice, and grid answers on the same page independently', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    const choices = [choice('choice-1', 0.5, 0.6)];
    const grids = [grid('grid-1', [gridRow('grid-1-row-1', 0.4)])];
    writeAnswersForPage(
      'book-a',
      29,
      { 'blank-1': 'ist', 'choice-1': 'group-1-3', 'grid-1-row-1': 'grid-group-1-nein' },
      blanks,
      choices,
      grids,
      SCHEMA,
      storage,
    );

    const restored = readAnswersForPage('book-a', 29, blanks, choices, grids, SCHEMA, storage);
    expect(restored).toEqual({
      'blank-1': 'ist',
      'choice-1': 'group-1-3',
      'grid-1-row-1': 'grid-group-1-nein',
    });
  });

  it('migrates legacy PoC 1 text answers on read and write', () => {
    storage.setItem(
      'lexora.exerciseAnswers.v1',
      JSON.stringify({
        version: 1,
        answers: {
          'book-a': {
            '11': {
              'blank-1': {
                fingerprint: blankFingerprint(blank('blank-1', 0.2, 0.3, 0.1), SCHEMA),
                text: 'ist',
                updatedAt: '2026-07-30T00:00:00Z',
              },
            },
          },
        },
      }),
    );
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];

    expect(readAnswersForPage('book-a', 11, blanks, [], [], SCHEMA, storage))
      .toEqual({ 'blank-1': 'ist' });

    writeAnswersForPage('book-a', 11, { 'blank-1': 'war' }, blanks, [], [], SCHEMA, storage);
    const migrated = JSON.parse(storage.raw()!);
    expect(migrated.answers['book-a']['11']['blank-1']).toMatchObject({
      kind: 'fill-blank',
      value: 'war',
    });
    expect(migrated.answers['book-a']['11']['blank-1']).not.toHaveProperty('text');
  });

  it('preserves answers across unrelated page writes', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, [], [], SCHEMA, storage);
    writeAnswersForPage('book-a', 20, { 'blank-1': 'sind' }, blanks, [], [], SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, [], [], SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
  });

  it('falls back to an empty store for malformed storage', () => {
    storage.setItem('lexora.exerciseAnswers.v1', '{not json');
    expect(loadAnswerStore(storage)).toEqual(emptyAnswerStore());
  });

  it('produces a stable fingerprint from blank geometry and schema', () => {
    const a = blank('blank-1', 0.200004, 0.300005, 0.1);
    const b = blank('blank-1', 0.2, 0.3, 0.1);
    expect(blankFingerprint(a, SCHEMA)).toBe(blankFingerprint(b, SCHEMA));
    expect(blankFingerprint(a, '0.3.0')).not.toBe(blankFingerprint(b, SCHEMA));
  });

  it('produces a stable fingerprint from choice geometry, group, and schema', () => {
    const a = choice('choice-1', 0.200004, 0.300005);
    const b = choice('choice-1', 0.2, 0.3);
    expect(choiceFingerprint(a, SCHEMA)).toBe(choiceFingerprint(b, SCHEMA));
    expect(choiceFingerprint(choice('choice-1', 0.2, 0.3, 'group-x'), SCHEMA))
      .not.toBe(choiceFingerprint(b, SCHEMA));
    expect(choiceFingerprint(a, '0.3.0')).not.toBe(choiceFingerprint(b, SCHEMA));
  });

  it('produces a stable fingerprint from grid row geometry, group, and schema', () => {
    const a = gridRow('grid-1-row-1', 0.400004);
    const b = gridRow('grid-1-row-1', 0.4);
    const g = grid('grid-1', []);
    expect(gridRowFingerprint(g, a, SCHEMA)).toBe(gridRowFingerprint(g, b, SCHEMA));
    expect(gridRowFingerprint({ ...g, optionGroupId: 'grid-group-x' }, b, SCHEMA))
      .not.toBe(gridRowFingerprint(g, b, SCHEMA));
    expect(gridRowFingerprint(g, a, '0.3.0')).not.toBe(gridRowFingerprint(g, b, SCHEMA));
  });
});
