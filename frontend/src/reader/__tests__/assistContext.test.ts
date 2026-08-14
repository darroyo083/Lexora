import { describe, expect, it } from 'vitest';
import type { CorrectionInteractionKind, CorrectionSlot } from '../../api/correction';
import { emptyPageInteractionState } from '../overlay';
import { computeCanCheck, isSourceBacked, kindOrdinal } from '../assistContext';

function slot(kind: CorrectionInteractionKind, ordinal: number, resolution: string): CorrectionSlot {
  return { interactionKind: kind, ordinal, resolution: resolution as CorrectionSlot['resolution'], entry: null };
}

describe('kindOrdinal', () => {
  it('finds the ordinal of a fill-in-line blank', () => {
    const interaction = emptyPageInteractionState();
    interaction.blanks = [
      { id: 'blank-01' } as never,
      { id: 'blank-02' } as never,
    ];
    expect(kindOrdinal('fill-in-line', 'blank-02', interaction)).toBe(1);
  });

  it('returns -1 for an unknown id', () => {
    const interaction = emptyPageInteractionState();
    expect(kindOrdinal('fill-in-line', 'missing', interaction)).toBe(-1);
  });
});

describe('isSourceBacked', () => {
  it('is true when a resolved slot exists for the kind and ordinal', () => {
    expect(isSourceBacked('fill-in-line', 0, [slot('fill-in-line', 0, 'RESOLVED')])).toBe(true);
  });

  it('is false when the slot is unresolved', () => {
    expect(isSourceBacked('fill-in-line', 0, [slot('fill-in-line', 0, 'UNMAPPED')])).toBe(false);
    expect(isSourceBacked('fill-in-line', 1, [slot('fill-in-line', 0, 'RESOLVED')])).toBe(false);
  });

  it('is always false for free-text (never auto-graded)', () => {
    expect(isSourceBacked('free-text', 0, [slot('free-text', 0, 'RESOLVED')])).toBe(false);
  });
});

describe('computeCanCheck', () => {
  const slots = [slot('fill-in-line', 0, 'RESOLVED')];

  it('requires an answer', () => {
    expect(computeCanCheck('fill-in-line', 0, '', slots)).toBe(false);
    expect(computeCanCheck('fill-in-line', 0, null, slots)).toBe(false);
  });

  it('is false for a source-backed exercise', () => {
    expect(computeCanCheck('fill-in-line', 0, 'stehe', slots)).toBe(false);
  });

  it('is true for an ungraded exercise with an answer', () => {
    expect(computeCanCheck('fill-in-line', 0, 'stehe', [slot('fill-in-line', 0, 'UNMAPPED')])).toBe(true);
  });

  it('is true for free-text with an answer regardless of resolution', () => {
    expect(computeCanCheck('free-text', 0, 'My answer', [slot('free-text', 0, 'RESOLVED')])).toBe(true);
  });
});
