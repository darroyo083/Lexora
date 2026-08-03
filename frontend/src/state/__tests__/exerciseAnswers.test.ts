import { describe, expect, it, beforeEach } from 'vitest';
import {
  blankFingerprint,
  emptyAnswerStore,
  loadAnswerStore,
  readAnswersForPage,
  writeAnswersForPage,
} from '../exerciseAnswers';
import type { ExerciseBlank } from '../../reader/types';

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

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('exercise answer persistence', () => {
  it('persists and restores answers for a page (refresh-style initialization)', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1), blank('blank-2', 0.5, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, SCHEMA, storage);

    const restored = readAnswersForPage('book-a', 11, blanks, SCHEMA, storage);

    expect(restored).toEqual({ 'blank-1': 'ist' });
  });

  it('keeps answers isolated by book', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, SCHEMA, storage);

    expect(readAnswersForPage('book-b', 11, blanks, SCHEMA, storage)).toEqual({});
    expect(readAnswersForPage('book-a', 11, blanks, SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
  });

  it('keeps answers isolated by page', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, SCHEMA, storage);
    writeAnswersForPage('book-a', 12, { 'blank-1': 'gehst' }, blanks, SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
    expect(readAnswersForPage('book-a', 12, blanks, SCHEMA, storage)).toEqual({ 'blank-1': 'gehst' });
  });

  it('keys answers by stable blank id, not order', () => {
    const first = [blank('blank-1', 0.2, 0.3, 0.1), blank('blank-2', 0.5, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist', 'blank-2': 'sind' }, first, SCHEMA, storage);

    const reordered = [first[1], first[0]];
    expect(readAnswersForPage('book-a', 11, reordered, SCHEMA, storage)).toEqual({
      'blank-1': 'ist',
      'blank-2': 'sind',
    });
  });

  it('ignores stale answers when the blank geometry changes after reprocessing', () => {
    const before = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, before, SCHEMA, storage);

    const after = [blank('blank-1', 0.2, 0.42, 0.1)];
    expect(readAnswersForPage('book-a', 11, after, SCHEMA, storage)).toEqual({});
  });

  it('ignores stale answers when the schema version changes', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, '0.2.0', storage);

    expect(readAnswersForPage('book-a', 11, blanks, '0.3.0', storage)).toEqual({});
  });

  it('ignores stored answers whose blank id no longer exists', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist', 'ghost': 'lost' }, blanks, SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
  });

  it('drops cleared answers instead of restoring them', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, SCHEMA, storage);
    writeAnswersForPage('book-a', 11, { 'blank-1': '' }, blanks, SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, SCHEMA, storage)).toEqual({});
  });

  it('preserves answers across unrelated page writes', () => {
    const blanks = [blank('blank-1', 0.2, 0.3, 0.1)];
    writeAnswersForPage('book-a', 11, { 'blank-1': 'ist' }, blanks, SCHEMA, storage);
    writeAnswersForPage('book-a', 20, { 'blank-1': 'sind' }, blanks, SCHEMA, storage);

    expect(readAnswersForPage('book-a', 11, blanks, SCHEMA, storage)).toEqual({ 'blank-1': 'ist' });
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
});
