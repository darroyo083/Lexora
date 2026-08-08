import { describe, it, expect } from 'vitest';
import {
  compareBlank,
  compareChoice,
  compareGrid,
  compareOrdering,
  compareMatching,
  checkFreeText,
  normalizeForComparison,
  isGradable,
  computeCorrectionMap,
} from '../correction';
import { CorrectionVerdict, AnswerResolutionStatus } from '../../state/correction';
import type { AnswerKeyEntry } from '../../api/correction';
import type { ChoiceGroup, ChoiceGridRow } from '../types';

function makeEntry(overrides: Partial<AnswerKeyEntry> = {}): AnswerKeyEntry {
  return {
    pageNumber: 1,
    interactionKind: 'fill-in-line',
    ordinal: 0,
    expectedValue: '',
    alternatives: [],
    caseSensitive: true,
    punctuationRequired: false,
    normalizationMode: 'strict',
    rawSolutionText: '',
    confidence: 1,
    mappingWarnings: [],
    ...overrides,
  };
}

const CHOICE_GROUP: ChoiceGroup = {
  id: 'g1',
  options: [
    { id: 'opt-a', label: 'A' },
    { id: 'opt-b', label: 'B' },
    { id: 'opt-c', label: 'C' },
  ],
};

function makeGridRow(id: string, y: number): ChoiceGridRow {
  return {
    id,
    rowBbox: { x: 0, y, width: 1, height: 0.05 },
    promptBbox: null,
    nearbyTextSpanIds: [],
    cells: [
      { id: `${id}-a`, optionId: 'opt-a', cellBbox: { x: 0, y, width: 0.33, height: 0.05 }, interactionBbox: { x: 0, y, width: 0.33, height: 0.05 } },
      { id: `${id}-b`, optionId: 'opt-b', cellBbox: { x: 0.33, y, width: 0.33, height: 0.05 }, interactionBbox: { x: 0.33, y, width: 0.33, height: 0.05 } },
    ],
  };
}

describe('normalizeForComparison', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeForComparison('  hello   world  ', true)).toBe('hello world');
  });

  it('lowercases when caseSensitive is false', () => {
    expect(normalizeForComparison('Hallo', false)).toBe('hallo');
  });

  it('does not lowercase when caseSensitive is true', () => {
    expect(normalizeForComparison('Hallo', true)).toBe('Hallo');
  });

  it('normalizes German curly quotes to straight quotes', () => {
    const input = '\u201EWort\u201C';
    expect(normalizeForComparison(input, true)).toBe('"Wort"');
  });

  it('normalizes en-dash and em-dash to hyphen', () => {
    expect(normalizeForComparison('a\u2013b', true)).toBe('a-b');
    expect(normalizeForComparison('a\u2014b', true)).toBe('a-b');
  });

  it('does NOT fold eszett to ss', () => {
    expect(normalizeForComparison('Straße', true)).toBe('Straße');
  });

  it('does NOT fold umlauts', () => {
    expect(normalizeForComparison('Mädchen', true)).toBe('Mädchen');
    expect(normalizeForComparison('Mädchen', false)).toBe('mädchen');
  });
});

describe('isGradable', () => {
  it('returns true for gradable kinds', () => {
    expect(isGradable('fill-in-line')).toBe(true);
    expect(isGradable('choice')).toBe(true);
  });

  it('returns false for free-text', () => {
    expect(isGradable('free-text')).toBe(false);
  });
});

describe('compareBlank', () => {
  it('returns CORRECT when learner matches expected', () => {
    const entry = makeEntry({ expectedValue: 'bin', interactionKind: 'fill-in-line' });
    const result = compareBlank({ learnerValue: 'bin', entry });
    expect(result.verdict).toBe(CorrectionVerdict.CORRECT);
    expect(result.resolution).toBe(AnswerResolutionStatus.RESOLVED);
  });

  it('returns CORRECT when learner matches an alternative', () => {
    const entry = makeEntry({ expectedValue: 'bin', alternatives: ['ist'], interactionKind: 'fill-in-line' });
    const result = compareBlank({ learnerValue: 'ist', entry });
    expect(result.verdict).toBe(CorrectionVerdict.CORRECT);
  });

  it('returns INCORRECT when learner does not match', () => {
    const entry = makeEntry({ expectedValue: 'bin', interactionKind: 'fill-in-line' });
    const result = compareBlank({ learnerValue: 'war', entry });
    expect(result.verdict).toBe(CorrectionVerdict.INCORRECT);
  });

  it('returns UNANSWERED when learner value is empty or undefined', () => {
    const entry = makeEntry({ expectedValue: 'bin' });
    expect(compareBlank({ learnerValue: '', entry }).verdict).toBe(CorrectionVerdict.UNANSWERED);
    expect(compareBlank({ learnerValue: undefined, entry }).verdict).toBe(CorrectionVerdict.UNANSWERED);
  });

  it('returns UNMAPPED with no verdict when no entry exists', () => {
    const result = compareBlank({ learnerValue: 'bin', entry: undefined });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });

  it('handles case sensitivity with German default true', () => {
    const entry = makeEntry({ expectedValue: 'Das', caseSensitive: true });
    expect(compareBlank({ learnerValue: 'das', entry }).verdict).toBe(CorrectionVerdict.INCORRECT);
    expect(compareBlank({ learnerValue: 'Das', entry }).verdict).toBe(CorrectionVerdict.CORRECT);
  });

  it('trims whitespace before comparison', () => {
    const entry = makeEntry({ expectedValue: 'bin' });
    expect(compareBlank({ learnerValue: '  bin  ', entry }).verdict).toBe(CorrectionVerdict.CORRECT);
  });

  it('never returns PARTIALLY_CORRECT for single items', () => {
    const entry = makeEntry({ expectedValue: 'bin' });
    const result = compareBlank({ learnerValue: 'bin', entry });
    expect(result.verdict).not.toBe(CorrectionVerdict.PARTIALLY_CORRECT);
  });
});

describe('compareChoice', () => {
  it('returns CORRECT when learner selects correct option', () => {
    const entry = makeEntry({ expectedValue: 'B', interactionKind: 'choice' });
    const result = compareChoice({
      learnerValue: 'opt-b', entry,
      choiceGroups: { g1: CHOICE_GROUP },
      optionGroupId: 'g1',
    });
    expect(result.verdict).toBe(CorrectionVerdict.CORRECT);
  });

  it('returns INCORRECT when learner selects wrong option', () => {
    const entry = makeEntry({ expectedValue: 'B', interactionKind: 'choice' });
    const result = compareChoice({
      learnerValue: 'opt-c', entry,
      choiceGroups: { g1: CHOICE_GROUP },
      optionGroupId: 'g1',
    });
    expect(result.verdict).toBe(CorrectionVerdict.INCORRECT);
  });

  it('returns UNANSWERED when learner has not selected', () => {
    const entry = makeEntry({ expectedValue: 'B', interactionKind: 'choice' });
    const result = compareChoice({
      learnerValue: undefined, entry,
      choiceGroups: { g1: CHOICE_GROUP },
      optionGroupId: 'g1',
    });
    expect(result.verdict).toBe(CorrectionVerdict.UNANSWERED);
  });

  it('returns UNMAPPED with no verdict when no entry', () => {
    const result = compareChoice({
      learnerValue: 'opt-a', entry: undefined,
      choiceGroups: { g1: CHOICE_GROUP },
      optionGroupId: 'g1',
    });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });
});

describe('compareGrid', () => {
  const rows = [makeGridRow('row-1', 0), makeGridRow('row-2', 0.06)];

  it('returns CORRECT when all rows correct', () => {
    const entry = makeEntry({ expectedValue: 'A,B', interactionKind: 'choice-grid' });
    const result = compareGrid({
      learnerValues: { 'row-1': 'opt-a', 'row-2': 'opt-b' }, rows, entry,
      choiceGroups: { g1: CHOICE_GROUP }, optionGroupId: 'g1',
    });
    expect(result.verdict).toBe(CorrectionVerdict.CORRECT);
  });

  it('returns PARTIALLY_CORRECT with count when some rows correct', () => {
    const entry = makeEntry({ expectedValue: 'A,B', interactionKind: 'choice-grid' });
    const result = compareGrid({
      learnerValues: { 'row-1': 'opt-a', 'row-2': 'opt-a' }, rows, entry,
      choiceGroups: { g1: CHOICE_GROUP }, optionGroupId: 'g1',
    });
    expect(result.verdict).toBe(CorrectionVerdict.PARTIALLY_CORRECT);
    expect(result.details).toEqual({ correctCount: 1, totalCount: 2 });
  });

  it('returns UNANSWERED when no rows answered', () => {
    const entry = makeEntry({ expectedValue: 'A,B', interactionKind: 'choice-grid' });
    const result = compareGrid({
      learnerValues: {}, rows, entry,
      choiceGroups: { g1: CHOICE_GROUP }, optionGroupId: 'g1',
    });
    expect(result.verdict).toBe(CorrectionVerdict.UNANSWERED);
  });

  it('returns UNMAPPED with no verdict when no entry', () => {
    const result = compareGrid({
      learnerValues: { 'row-1': 'opt-a' }, rows, entry: undefined,
      choiceGroups: { g1: CHOICE_GROUP }, optionGroupId: 'g1',
    });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });
});

describe('compareOrdering', () => {
  it('returns CORRECT when sequence matches exactly', () => {
    const entry = makeEntry({ expectedValue: 'item1,item2,item3', interactionKind: 'sentence-ordering' });
    const result = compareOrdering({ learnerValue: 'item1,item2,item3', entry, itemCount: 3 });
    expect(result.verdict).toBe(CorrectionVerdict.CORRECT);
  });

  it('returns PARTIALLY_CORRECT when some positions correct', () => {
    const entry = makeEntry({ expectedValue: 'item1,item2,item3', interactionKind: 'sentence-ordering' });
    const result = compareOrdering({ learnerValue: 'item1,item3,item2', entry, itemCount: 3 });
    expect(result.verdict).toBe(CorrectionVerdict.PARTIALLY_CORRECT);
    expect(result.details).toEqual({ correctCount: 1, totalCount: 3 });
  });

  it('returns INCORRECT when none in correct position', () => {
    const entry = makeEntry({ expectedValue: 'item1,item2,item3', interactionKind: 'sentence-ordering' });
    const result = compareOrdering({ learnerValue: 'item3,item1,item2', entry, itemCount: 3 });
    expect(result.verdict).toBe(CorrectionVerdict.INCORRECT);
  });

  it('returns UNANSWERED when no items placed', () => {
    const entry = makeEntry({ expectedValue: 'item1,item2,item3', interactionKind: 'sentence-ordering' });
    expect(compareOrdering({ learnerValue: '', entry, itemCount: 3 }).verdict).toBe(CorrectionVerdict.UNANSWERED);
  });

  it('returns UNANSWERED when not fully placed', () => {
    const entry = makeEntry({ expectedValue: 'item1,item2,item3', interactionKind: 'sentence-ordering' });
    const result = compareOrdering({ learnerValue: 'item1,item2', entry, itemCount: 3 });
    expect(result.verdict).toBe(CorrectionVerdict.UNANSWERED);
  });

  it('returns UNMAPPED with no verdict when no entry', () => {
    const result = compareOrdering({ learnerValue: 'item1,item2', entry: undefined, itemCount: 2 });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });
});

describe('compareMatching', () => {
  it('returns CORRECT when all pairs match', () => {
    const entry = makeEntry({ expectedValue: 'A-1,B-2,C-3', interactionKind: 'matching' });
    const pairs = JSON.stringify({ A: '1', B: '2', C: '3' });
    const result = compareMatching({ learnerValue: pairs, entry });
    expect(result.verdict).toBe(CorrectionVerdict.CORRECT);
  });

  it('returns PARTIALLY_CORRECT when some pairs correct', () => {
    const entry = makeEntry({ expectedValue: 'A-1,B-2,C-3', interactionKind: 'matching' });
    const pairs = JSON.stringify({ A: '1', B: '3', C: '2' });
    const result = compareMatching({ learnerValue: pairs, entry });
    expect(result.verdict).toBe(CorrectionVerdict.PARTIALLY_CORRECT);
    expect(result.details).toEqual({ correctCount: 1, totalCount: 3 });
  });

  it('returns UNANSWERED when no pairs formed', () => {
    const entry = makeEntry({ expectedValue: 'A-1,B-2', interactionKind: 'matching' });
    const result = compareMatching({ learnerValue: '', entry });
    expect(result.verdict).toBe(CorrectionVerdict.UNANSWERED);
  });

  it('returns UNMAPPED with no verdict when no entry', () => {
    const result = compareMatching({ learnerValue: JSON.stringify({ A: '1' }), entry: undefined });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });
});

describe('UNMAPPED', () => {
  it('Choice UNMAPPED has undefined verdict, never INCORRECT', () => {
    const result = compareChoice({
      learnerValue: 'opt-a', entry: undefined,
      choiceGroups: { g1: CHOICE_GROUP }, optionGroupId: 'g1',
    });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
    expect(result.verdict).not.toBe(CorrectionVerdict.INCORRECT);
  });

  it('ChoiceGrid UNMAPPED has undefined verdict', () => {
    const rows = [makeGridRow('row-1', 0)];
    const result = compareGrid({
      learnerValues: {}, rows, entry: undefined,
      choiceGroups: { g1: CHOICE_GROUP }, optionGroupId: 'g1',
    });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });

  it('SentenceOrdering UNMAPPED has undefined verdict', () => {
    const result = compareOrdering({ learnerValue: 'a,b', entry: undefined, itemCount: 2 });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });
});

describe('FreeText NOT_AUTO_GRADABLE', () => {
  it('checkFreeText always returns NOT_AUTO_GRADABLE verdict', () => {
    const result = checkFreeText(false);
    expect(result.verdict).toBe(CorrectionVerdict.NOT_AUTO_GRADABLE);
    expect(result.verdict).not.toBe(CorrectionVerdict.CORRECT);
    expect(result.verdict).not.toBe(CorrectionVerdict.INCORRECT);
  });

  it('FreeText resolution is MISSING when no reference', () => {
    const result = checkFreeText(false);
    expect(result.resolution).toBe(AnswerResolutionStatus.MISSING);
  });

  it('FreeText resolution is RESOLVED when reference present', () => {
    const result = checkFreeText(true);
    expect(result.resolution).toBe(AnswerResolutionStatus.RESOLVED);
  });
});

describe('UNMAPPED vs NOT_AUTO_GRADABLE distinction', () => {
  it('UNMAPPED FillBlank has undefined verdict, never NOT_AUTO_GRADABLE', () => {
    const result = compareBlank({ learnerValue: 'test', entry: undefined });
    expect(result.verdict).toBeUndefined();
    expect(result.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });

  it('NOT_AUTO_GRADABLE is only for FreeText', () => {
    const freeTextResult = checkFreeText(false);
    expect(freeTextResult.verdict).toBe(CorrectionVerdict.NOT_AUTO_GRADABLE);

    const blankResult = compareBlank({ learnerValue: 'test', entry: undefined });
    expect(blankResult.verdict).not.toBe(CorrectionVerdict.NOT_AUTO_GRADABLE);
    expect(blankResult.resolution).toBe(AnswerResolutionStatus.UNMAPPED);
  });

  it('UNMAPPED never resolves to MISSING for gradable kinds', () => {
    const blankResult = compareBlank({ learnerValue: 'test', entry: undefined });
    expect(blankResult.resolution).not.toBe(AnswerResolutionStatus.MISSING);

    const choiceResult = compareChoice({
      learnerValue: 'opt-a', entry: undefined,
      choiceGroups: { g1: CHOICE_GROUP }, optionGroupId: 'g1',
    });
    expect(choiceResult.resolution).not.toBe(AnswerResolutionStatus.MISSING);
  });
});

describe('deterministic', () => {
  it('same inputs produce same outputs', () => {
    const entry = makeEntry({ expectedValue: 'bin', interactionKind: 'fill-in-line' });
    const r1 = compareBlank({ learnerValue: 'bin', entry });
    const r2 = compareBlank({ learnerValue: 'bin', entry });
    expect(r1.verdict).toBe(r2.verdict);
    expect(r1.resolution).toBe(r2.resolution);
  });

  it('computeCorrectionMap returns consistent results', () => {
    const entry = makeEntry({ expectedValue: 'bin', interactionKind: 'fill-in-line' });
    const result = computeCorrectionMap({
      blanks: [
        { id: 'b1', blank: { kind: 'fill-in-line' }, learnerValue: 'bin', entry },
        { id: 'b2', blank: { kind: 'fill-in-line' }, learnerValue: 'war', entry },
      ],
      choices: [],
      choiceGroups: {},
      grids: [],
      orderings: [],
      matchings: [],
      freeTexts: [],
    });
    expect(result.verdictByItem.b1).toBe(CorrectionVerdict.CORRECT);
    expect(result.verdictByItem.b2).toBe(CorrectionVerdict.INCORRECT);
  });
});
