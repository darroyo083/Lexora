import type { AnswerKeyEntry } from '../api/correction';
import type {
  ChoiceGrid,
  ChoiceGridRow,
  ChoiceGroup,
  MatchingInteraction,
  MatchingItem,
} from '../reader/types';
import { parseOrderedAnswer } from './ordering';
import { parseMatchingAnswer } from './matching';
import {
  CorrectionVerdict,
  AnswerResolutionStatus,
  type CorrectionResult,
} from '../state/correction';

export interface FillBlankInput {
  learnerValue: string | undefined;
  entry: AnswerKeyEntry | undefined;
}

export interface ChoiceInput {
  learnerValue: string | undefined;
  entry: AnswerKeyEntry | undefined;
  choiceGroups: Record<string, ChoiceGroup>;
  optionGroupId: string | null;
}

export interface ChoiceGridInput {
  learnerValues: Record<string, string>;
  rows: ChoiceGridRow[];
  entry: AnswerKeyEntry | undefined;
  choiceGroups: Record<string, ChoiceGroup>;
  optionGroupId: string;
}

export interface OrderingInput {
  learnerValue: string | undefined;
  entry: AnswerKeyEntry | undefined;
  itemCount: number;
}

export interface MatchingInput {
  learnerValue: string | undefined;
  entry: AnswerKeyEntry | undefined;
  matching: MatchingInteraction;
}

export function isGradable(interactionKind: string): boolean {
  return interactionKind !== 'free-text';
}

function normalizeGermanQuotes(value: string): string {
  return value
    .replace(/\u201E/g, '"')
    .replace(/\u201C/g, '"');
}

function normalizeApostrophe(value: string): string {
  return value
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'");
}

function normalizeHyphen(value: string): string {
  return value
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-');
}

export function normalizeForComparison(value: string, caseSensitive: boolean): string {
  let result = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  result = normalizeGermanQuotes(result);
  result = normalizeApostrophe(result);
  result = normalizeHyphen(result);
  if (!caseSensitive) {
    result = result.toLowerCase();
  }
  return result;
}

function isMatch(learner: string, expected: string, caseSensitive: boolean): boolean {
  return normalizeForComparison(learner, caseSensitive) === normalizeForComparison(expected, caseSensitive);
}

function matchesAnyAlternative(
  learner: string,
  entry: AnswerKeyEntry,
): boolean {
  if (isMatch(learner, entry.expectedValue, entry.caseSensitive)) return true;
  return entry.alternatives.some((alt) =>
    isMatch(learner, alt, entry.caseSensitive),
  );
}

export function compareBlank(input: FillBlankInput): CorrectionResult {
  const { learnerValue, entry } = input;

  if (!entry) {
    return { verdict: undefined, resolution: AnswerResolutionStatus.UNMAPPED };
  }

  const resolution = AnswerResolutionStatus.RESOLVED;

  if (!learnerValue || learnerValue.trim() === '') {
    return { verdict: CorrectionVerdict.UNANSWERED, resolution };
  }

  if (matchesAnyAlternative(learnerValue, entry)) {
    return { verdict: CorrectionVerdict.CORRECT, resolution };
  }

  return { verdict: CorrectionVerdict.INCORRECT, resolution };
}

function resolveOptionLabel(
  label: string,
  choiceGroups: Record<string, ChoiceGroup>,
  optionGroupId: string | null,
): string | null {
  if (!optionGroupId) return null;
  const group = choiceGroups[optionGroupId];
  if (!group) return null;
  const matches = group.options.filter((opt) =>
    opt.label.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  if (matches.length === 1) return matches[0].id;
  return null;
}

export function compareChoice(input: ChoiceInput): CorrectionResult {
  const { learnerValue, entry, choiceGroups, optionGroupId } = input;

  if (!entry) {
    return {
      verdict: undefined,
      resolution: AnswerResolutionStatus.UNMAPPED,
    };
  }

  if (!learnerValue) {
    return { verdict: CorrectionVerdict.UNANSWERED, resolution: AnswerResolutionStatus.RESOLVED };
  }

  const expectedOptionId = resolveOptionLabel(entry.expectedValue, choiceGroups, optionGroupId);
  if (!expectedOptionId) {
    // The answer key exists but its expected value cannot be resolved to a
    // single option. NOT_AUTO_GRADABLE is FreeText-only; without a resolvable
    // expected option we cannot grade, so stay neutral (fail closed).
    return {
      verdict: undefined,
      resolution: AnswerResolutionStatus.AMBIGUOUS,
    };
  }

  if (learnerValue === expectedOptionId) {
    return { verdict: CorrectionVerdict.CORRECT, resolution: AnswerResolutionStatus.RESOLVED };
  }

  return { verdict: CorrectionVerdict.INCORRECT, resolution: AnswerResolutionStatus.RESOLVED };
}

export function compareGrid(input: ChoiceGridInput): CorrectionResult {
  const { learnerValues, rows, entry, choiceGroups, optionGroupId } = input;

  if (!entry) {
    return {
      verdict: undefined,
      resolution: AnswerResolutionStatus.UNMAPPED,
    };
  }

  const expectedLabels = entry.expectedValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let correctCount = 0;
  let answeredCount = 0;
  let unresolvableExpectedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const learnerValue = learnerValues[row.id];
    if (learnerValue) answeredCount++;

    if (!learnerValue) continue;

    const expectedLabel = expectedLabels[i];
    if (!expectedLabel) continue;

    const expectedOptionId = resolveOptionLabel(expectedLabel, choiceGroups, optionGroupId);
    if (!expectedOptionId) {
      unresolvableExpectedCount++;
      continue;
    }

    if (learnerValue === expectedOptionId) {
      correctCount++;
    }
  }

  if (answeredCount === 0) {
    return { verdict: CorrectionVerdict.UNANSWERED, resolution: AnswerResolutionStatus.RESOLVED };
  }

  if (unresolvableExpectedCount > 0) {
    // An answered row's expected label cannot be resolved to a single option:
    // we cannot grade that row, so any verdict would be misleading. Stay
    // neutral (fail closed), mirroring the Choice AMBIGUOUS semantics.
    return {
      verdict: undefined,
      resolution: AnswerResolutionStatus.AMBIGUOUS,
    };
  }

  if (correctCount === rows.length) {
    return { verdict: CorrectionVerdict.CORRECT, resolution: AnswerResolutionStatus.RESOLVED };
  }

  if (correctCount > 0) {
    return {
      verdict: CorrectionVerdict.PARTIALLY_CORRECT,
      resolution: AnswerResolutionStatus.RESOLVED,
      details: { correctCount, totalCount: rows.length },
    };
  }

  return { verdict: CorrectionVerdict.INCORRECT, resolution: AnswerResolutionStatus.RESOLVED };
}

export function compareOrdering(input: OrderingInput): CorrectionResult {
  const { learnerValue, entry, itemCount } = input;

  if (!entry) {
    return {
      verdict: undefined,
      resolution: AnswerResolutionStatus.UNMAPPED,
    };
  }

  const learnerSequence = parseOrderedAnswer(learnerValue);

  if (learnerSequence.length === 0) {
    return { verdict: CorrectionVerdict.UNANSWERED, resolution: AnswerResolutionStatus.RESOLVED };
  }

  if (learnerSequence.length < itemCount) {
    return { verdict: CorrectionVerdict.UNANSWERED, resolution: AnswerResolutionStatus.RESOLVED };
  }

  const expectedSequence = entry.expectedValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (learnerSequence.length !== expectedSequence.length) {
    return {
      verdict: CorrectionVerdict.PARTIALLY_CORRECT,
      resolution: AnswerResolutionStatus.RESOLVED,
    };
  }

  let correctPositions = 0;
  for (let i = 0; i < learnerSequence.length; i++) {
    if (learnerSequence[i] === expectedSequence[i]) {
      correctPositions++;
    }
  }

  if (correctPositions === learnerSequence.length) {
    return { verdict: CorrectionVerdict.CORRECT, resolution: AnswerResolutionStatus.RESOLVED };
  }

  if (correctPositions > 0) {
    return {
      verdict: CorrectionVerdict.PARTIALLY_CORRECT,
      resolution: AnswerResolutionStatus.RESOLVED,
      details: { correctCount: correctPositions, totalCount: learnerSequence.length },
    };
  }

  return { verdict: CorrectionVerdict.INCORRECT, resolution: AnswerResolutionStatus.RESOLVED };
}

export function compareMatching(input: MatchingInput): CorrectionResult {
  const { learnerValue, entry, matching } = input;

  if (!entry) {
    return {
      verdict: undefined,
      resolution: AnswerResolutionStatus.UNMAPPED,
    };
  }

  const learnerPairs = parseMatchingAnswer(learnerValue);
  const learnerPairCount = Object.keys(learnerPairs).length;

  if (learnerPairCount === 0) {
    return { verdict: CorrectionVerdict.UNANSWERED, resolution: AnswerResolutionStatus.RESOLVED };
  }

  const expected = resolveMatchingPairs(entry, matching);
  if (!expected.complete || expected.pairs.length === 0) {
    return { verdict: undefined, resolution: AnswerResolutionStatus.AMBIGUOUS };
  }
  const expectedPairs = expected.pairs;
  const totalPairs = expectedPairs.length;

  let correctCount = 0;
  for (const expected of expectedPairs) {
    if (learnerPairs[expected.left] === expected.right) {
      correctCount++;
    }
  }

  if (correctCount === totalPairs && learnerPairCount === totalPairs) {
    return { verdict: CorrectionVerdict.CORRECT, resolution: AnswerResolutionStatus.RESOLVED };
  }

  if (correctCount > 0) {
    return {
      verdict: CorrectionVerdict.PARTIALLY_CORRECT,
      resolution: AnswerResolutionStatus.RESOLVED,
      details: { correctCount, totalCount: totalPairs },
    };
  }

  return { verdict: CorrectionVerdict.INCORRECT, resolution: AnswerResolutionStatus.RESOLVED };
}

export function parseMatchingPairsFromEntry(
  entry: AnswerKeyEntry,
  matching: MatchingInteraction,
): Array<{ left: string; right: string }> {
  return resolveMatchingPairs(entry, matching).pairs;
}

function matchingSourcePairs(entry: AnswerKeyEntry): Array<{ left: string; right: string }> {
  if (entry.typedPayload?.kind === 'matching') {
    return entry.typedPayload.pairs.map((pair) => ({
      left: pair.leftLabel,
      right: pair.rightLabel,
    }));
  }
  return entry.expectedValue
    .split(/[;,]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const delimiter = segment.includes('=') ? '=' : segment.includes('->') ? '->' : '-';
      const [left, right] = segment.split(delimiter, 2).map((part) => part.trim());
      return { left, right };
    })
    .filter((pair) => Boolean(pair.left && pair.right));
}

function resolveMatchingItem(value: string, items: MatchingItem[]): string | null {
  const byId = items.filter((item) => item.id === value);
  if (byId.length === 1) return byId[0].id;
  const normalized = normalizeForComparison(value, false);
  const byLabelOrText = items.filter((item) => (
    normalizeForComparison(item.label, false) === normalized
    || normalizeForComparison(item.text, false) === normalized
  ));
  return byLabelOrText.length === 1 ? byLabelOrText[0].id : null;
}

function resolveMatchingPairs(
  entry: AnswerKeyEntry,
  matching: MatchingInteraction,
): { pairs: Array<{ left: string; right: string }>; complete: boolean } {
  const source = matchingSourcePairs(entry);
  const pairs: Array<{ left: string; right: string }> = [];
  for (const pair of source) {
    const left = resolveMatchingItem(pair.left, matching.leftItems);
    const right = resolveMatchingItem(pair.right, matching.rightItems);
    if (!left || !right) return { pairs, complete: false };
    pairs.push({ left, right });
  }
  const uniqueLeft = new Set(pairs.map((pair) => pair.left));
  const uniqueRight = new Set(pairs.map((pair) => pair.right));
  return {
    pairs,
    complete: pairs.length === source.length
      && uniqueLeft.size === pairs.length
      && uniqueRight.size === pairs.length,
  };
}

export function checkFreeText(hasReference: boolean): CorrectionResult {
  return {
    verdict: CorrectionVerdict.NOT_AUTO_GRADABLE,
    resolution: hasReference
      ? AnswerResolutionStatus.RESOLVED
      : AnswerResolutionStatus.MISSING,
  };
}

export interface CorrectionMapInput {
  blanks: Array<{
    id: string;
    blank: { kind: string };
    learnerValue: string | undefined;
    entry: AnswerKeyEntry | undefined;
    sourceResolution?: AnswerResolutionStatus;
  }>;
  choices: Array<{
    id: string;
    choice: { kind: string; optionGroupId: string | null };
    learnerValue: string | undefined;
    entry: AnswerKeyEntry | undefined;
    sourceResolution?: AnswerResolutionStatus;
  }>;
  choiceGroups: Record<string, ChoiceGroup>;
  grids: Array<{
    id: string;
    grid: ChoiceGrid;
    learnerValues: Record<string, string>;
    rows: ChoiceGridRow[];
    entry: AnswerKeyEntry | undefined;
    sourceResolution?: AnswerResolutionStatus;
  }>;
  orderings: Array<{
    id: string;
    ordering: { kind: string; items: Array<{ id: string }> };
    learnerValue: string | undefined;
    entry: AnswerKeyEntry | undefined;
    sourceResolution?: AnswerResolutionStatus;
  }>;
  matchings: Array<{
    id: string;
    matching: MatchingInteraction;
    learnerValue: string | undefined;
    entry: AnswerKeyEntry | undefined;
    sourceResolution?: AnswerResolutionStatus;
  }>;
  freeTexts: Array<{
    id: string;
    freeText: { kind: string };
    learnerValue: string | undefined;
    entry: AnswerKeyEntry | undefined;
    sourceResolution?: AnswerResolutionStatus;
  }>;
}

export function computeCorrectionMap(
  input: CorrectionMapInput,
): {
  verdictByItem: Record<string, CorrectionVerdict | undefined>;
  resolutionByItem: Record<string, AnswerResolutionStatus>;
  resultDetailsByItem: Record<string, { correctCount: number; totalCount: number }>;
} {
  const verdictByItem: Record<string, CorrectionVerdict | undefined> = {};
  const resolutionByItem: Record<string, AnswerResolutionStatus> = {};
  const resultDetailsByItem: Record<string, { correctCount: number; totalCount: number }> = {};

  const preserveSourceResolution = (
    sourceResolution: AnswerResolutionStatus | undefined,
    compare: () => CorrectionResult,
  ): CorrectionResult => (
    sourceResolution && sourceResolution !== AnswerResolutionStatus.RESOLVED
      ? { verdict: undefined, resolution: sourceResolution }
      : compare()
  );

  for (const blank of input.blanks) {
    const result = preserveSourceResolution(blank.sourceResolution, () => compareBlank({
      learnerValue: blank.learnerValue,
      entry: blank.entry,
    }));
    verdictByItem[blank.id] = result.verdict;
    resolutionByItem[blank.id] = result.resolution;
  }

  for (const choice of input.choices) {
    const result = preserveSourceResolution(choice.sourceResolution, () => compareChoice({
      learnerValue: choice.learnerValue,
      entry: choice.entry,
      choiceGroups: input.choiceGroups,
      optionGroupId: choice.choice.optionGroupId,
    }));
    verdictByItem[choice.id] = result.verdict;
    resolutionByItem[choice.id] = result.resolution;
  }

  for (const grid of input.grids) {
    const result = preserveSourceResolution(grid.sourceResolution, () => compareGrid({
      learnerValues: grid.learnerValues,
      rows: grid.rows,
      entry: grid.entry,
      choiceGroups: input.choiceGroups,
      optionGroupId: grid.grid.optionGroupId,
    }));
    verdictByItem[grid.id] = result.verdict;
    resolutionByItem[grid.id] = result.resolution;
    if (result.details) {
      resultDetailsByItem[grid.id] = {
        correctCount: result.details.correctCount ?? 0,
        totalCount: result.details.totalCount ?? 0,
      };
    }
  }

  for (const ordering of input.orderings) {
    const result = preserveSourceResolution(ordering.sourceResolution, () => compareOrdering({
      learnerValue: ordering.learnerValue,
      entry: ordering.entry,
      itemCount: ordering.ordering.items.length,
    }));
    verdictByItem[ordering.id] = result.verdict;
    resolutionByItem[ordering.id] = result.resolution;
    if (result.details) {
      resultDetailsByItem[ordering.id] = {
        correctCount: result.details.correctCount ?? 0,
        totalCount: result.details.totalCount ?? 0,
      };
    }
  }

  for (const matching of input.matchings) {
    const result = preserveSourceResolution(matching.sourceResolution, () => compareMatching({
      learnerValue: matching.learnerValue,
      entry: matching.entry,
      matching: matching.matching,
    }));
    verdictByItem[matching.id] = result.verdict;
    resolutionByItem[matching.id] = result.resolution;
    if (result.details) {
      resultDetailsByItem[matching.id] = {
        correctCount: result.details.correctCount ?? 0,
        totalCount: result.details.totalCount ?? 0,
      };
    }
  }

  for (const freeText of input.freeTexts) {
    const hasReference = freeText.entry?.typedPayload?.kind === 'reference';
    const result = preserveSourceResolution(freeText.sourceResolution, () => checkFreeText(hasReference));
    verdictByItem[freeText.id] = result.verdict;
    resolutionByItem[freeText.id] = result.resolution;
  }

  return { verdictByItem, resolutionByItem, resultDetailsByItem };
}
