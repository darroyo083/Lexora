// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RightRail from '../RightRail';
import { CorrectionVerdict, AnswerResolutionStatus } from '../../state/correction';
import type { AnswerKeyEntry, CorrectionSlot } from '../../api/correction';
import type { ExerciseBlank, FreeTextInteraction } from '../../reader/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

const BLANK: ExerciseBlank = {
  id: 'blank-1',
  kind: 'fill-in-line',
  lineBbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.01 },
  interactionBbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.03 },
  detectionMethod: 'horizontal-line-v1',
  candidateScore: 0.9,
  nearbyTextSpanIds: [],
};

const FREE_TEXT: FreeTextInteraction = {
  id: 'ft-1',
  kind: 'free-text',
  bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.05 },
  detectionMethod: 'free-text-v1',
  candidateScore: 0.9,
  nearbyTextSpanIds: [],
  responseLines: [],
};

function entry(overrides: Partial<AnswerKeyEntry> = {}): AnswerKeyEntry {
  return {
    pageNumber: 1,
    interactionKind: 'fill-in-line',
    ordinal: 0,
    expectedValue: 'bin',
    alternatives: ['ist'],
    caseSensitive: true,
    punctuationRequired: false,
    normalizationMode: 'strict',
    rawSolutionText: '',
    confidence: 1,
    mappingWarnings: [],
    ...overrides,
  };
}

function slot(
  interactionKind: CorrectionSlot['interactionKind'],
  ordinal: number,
  entry: AnswerKeyEntry,
): CorrectionSlot {
  return { interactionKind, ordinal, resolution: 'RESOLVED', entry };
}

function renderRail(overrides: Record<string, unknown> = {}) {
  const base = {
    devMode: false,
    spans: [],
    blanks: [BLANK],
    choices: [],
    grids: [],
    sentenceOrderings: [],
    matchings: [],
    freeTexts: [],
    answers: { 'blank-1': 'bin' },
    choiceGroups: {},
    expectedSequencesByItem: {},
    pageNumber: 1,
    selectedSpan: null,
    selectedBlank: null,
    selectedChoice: null,
    orderingActivePrompt: null,
    orderingPanelCollapsed: false,
    processing: false,
    orderingMode: 'docked' as const,
    onPromptChange: vi.fn(),
    onOrderingChange: vi.fn(),
    onCollapseChange: vi.fn(),
    onFloat: vi.fn(),
    showBoxes: false,
    setShowBoxes: vi.fn(),
    showBlankDetection: false,
    setShowBlankDetection: vi.fn(),
    showChoiceDetection: false,
    setShowChoiceDetection: vi.fn(),
    showGridDetection: false,
    setShowGridDetection: vi.fn(),
    showSentenceOrderingDetection: false,
    setShowSentenceOrderingDetection: vi.fn(),
    showMatchingDetection: false,
    setShowMatchingDetection: vi.fn(),
    showFreeTextDetection: false,
    setShowFreeTextDetection: vi.fn(),
    onBlankClick: vi.fn(),
    onChoiceClick: vi.fn(),
    verdictByItem: {},
    resolutionByItem: {},
    correctionDetails: {},
    correctionReveal: {},
    correctionUiState: 'IDLE',
    hasAnswerKey: true,
    correctionSlots: [],
    onCheck: vi.fn(),
    onRetry: vi.fn(),
    onReveal: vi.fn(),
  };
  return render(<RightRail {...base} {...overrides} />);
}

describe('RightRail reveal wiring', () => {
  it('renders a RevealBlock per blank when an answer key entry exists', () => {
    renderRail({ correctionSlots: [slot('fill-in-line', 0, entry())] });
    expect(screen.getByRole('button', { name: /Show answer/ })).toBeTruthy();
    expect(screen.getByText('bin')).toBeTruthy();
  });

  it('invoking reveal calls onReveal with the item id and does not touch the learner value', () => {
    const onReveal = vi.fn();
    renderRail({ correctionSlots: [slot('fill-in-line', 0, entry())], onReveal });
    fireEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    expect(onReveal).toHaveBeenCalledWith('blank-1');
    expect(screen.getByText('bin')).toBeTruthy();
  });

  it('shows the answer key and accepted alternatives once revealed', () => {
    renderRail({
      correctionSlots: [slot('fill-in-line', 0, entry())],
      correctionReveal: { 'blank-1': true },
    });
    expect(screen.getByText('Answer key:')).toBeTruthy();
    expect(screen.getByText('ist')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });

  it('does not render reveal blocks for UNMAPPED items (no authoritative answer)', () => {
    renderRail({
      verdictByItem: { 'blank-1': undefined },
      resolutionByItem: { 'blank-1': AnswerResolutionStatus.UNMAPPED },
    });
    expect(screen.queryByRole('button', { name: /Show answer/ })).toBeNull();
    expect(screen.getByText('No answer key available')).toBeTruthy();
  });

  it('shows a neutral AMBIGUOUS row without verdict or reveal', () => {
    renderRail({
      correctionSlots: [slot('choice', 0, entry({ interactionKind: 'choice' as const, expectedValue: 'Z' }))],
      blanks: [],
      choices: [{
        id: 'choice-1',
        kind: 'choice' as const,
        targetBbox: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 },
        interactionBbox: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 },
        optionGroupId: null,
        detectionMethod: 'empty-ring-v1' as const,
        candidateScore: 0.9,
        nearbyTextSpanIds: [],
      }],
      answers: {},
      verdictByItem: { 'choice-1': undefined },
      resolutionByItem: { 'choice-1': AnswerResolutionStatus.AMBIGUOUS },
      onChoiceClick: vi.fn(),
    });
    expect(screen.queryByText('Incorrect')).toBeNull();
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByRole('button', { name: /Show answer/ })).toBeNull();
  });

  it('renders the free-text reference reveal when a reference answer is recorded', () => {
    renderRail({
      blanks: [],
      freeTexts: [FREE_TEXT],
      answers: {},
      correctionSlots: [slot('free-text', 0, entry({
        interactionKind: 'free-text' as const,
        expectedValue: '',
        typedPayload: { kind: 'reference' as const, modelText: 'Der Hund spielt.', sourceHint: 'p. 3' },
      }))],
      verdictByItem: { 'ft-1': CorrectionVerdict.NOT_AUTO_GRADABLE },
    });
    expect(screen.getByRole('button', { name: /Reference answer/ })).toBeTruthy();
  });

  it('shows pair counts for a PARTIALLY_CORRECT matching exercise', () => {
    renderRail({
      blanks: [],
      matchings: [{
        id: 'match-1',
        kind: 'matching' as const,
        bbox: { x: 0.1, y: 0.2, width: 0.6, height: 0.1 },
        detectionMethod: 'matching-v1' as const,
        candidateScore: 0.9,
        cardinality: 'one-to-one' as const,
        nearbyTextSpanIds: [],
        leftItems: [],
        rightItems: [],
      }],
      answers: {},
      correctionSlots: [slot('matching', 0, entry({ interactionKind: 'matching' as const, expectedValue: 'A-1,B-2' }))],
      verdictByItem: { 'match-1': CorrectionVerdict.PARTIALLY_CORRECT },
      resolutionByItem: { 'match-1': AnswerResolutionStatus.RESOLVED },
      correctionDetails: { 'match-1': { correctCount: 1, totalCount: 2 } },
    });
    expect(screen.getByText('1 of 2 correct')).toBeTruthy();
  });
});

describe('mapping contract (unit-based resolution)', () => {
  it('reveals a slot entry even when the entry pageNumber is a Loesungen page, not the exercise page', () => {
    renderRail({
      correctionSlots: [slot('fill-in-line', 0, entry({ pageNumber: 228, unitNumber: 85, subExerciseMarker: '1' }))],
    });
    expect(screen.getByRole('button', { name: /Show answer/ })).toBeTruthy();
    expect(screen.getByText('bin')).toBeTruthy();
  });

  it('does not reveal for an AMBIGUOUS slot (no authoritative verdict possible)', () => {
    renderRail({
      correctionSlots: [{
        interactionKind: 'fill-in-line',
        ordinal: 0,
        resolution: 'AMBIGUOUS',
        entry: null,
      }],
    });
    expect(screen.queryByRole('button', { name: /Show answer/ })).toBeNull();
  });

  it('does not reveal for an UNMAPPED slot', () => {
    renderRail({
      correctionSlots: [{
        interactionKind: 'fill-in-line',
        ordinal: 0,
        resolution: 'UNMAPPED',
        entry: null,
      }],
      verdictByItem: { 'blank-1': undefined },
      resolutionByItem: { 'blank-1': AnswerResolutionStatus.UNMAPPED },
    });
    expect(screen.queryByRole('button', { name: /Show answer/ })).toBeNull();
    expect(screen.getByText('No answer key available')).toBeTruthy();
  });

  it('reveals the resolved item of a multi-item block via the slot entry', () => {
    renderRail({
      correctionSlots: [slot('fill-in-line', 0, entry({ pageNumber: 230, unitNumber: 85, expectedValue: 'brennende' }))],
      correctionReveal: { 'blank-1': true },
    });
    expect(screen.getByText('brennende')).toBeTruthy();
  });
});