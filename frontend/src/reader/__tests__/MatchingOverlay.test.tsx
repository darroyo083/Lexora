// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MatchingOverlay from '../MatchingOverlay';
import type { MatchingInteraction } from '../types';
import { CorrectionVerdict } from '../../state/correction';
import { serializeMatchingAnswer } from '../matching';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

function interaction(overrides: Partial<MatchingInteraction> = {}): MatchingInteraction {
  const ids = ['l1', 'l2', 'l3', 'r1', 'r2', 'r3'];
  const item = (id: string, side: 'left' | 'right') => ({
    id,
    label: id,
    text: `item ${id}`,
    bbox: { x: side === 'left' ? 0.1 : 0.7, y: 0.2 + ids.indexOf(id) * 0.02, width: 0.15, height: 0.015 },
    anchorBbox: side === 'left'
      ? { x: 0.3, y: 0.2 + ids.indexOf(id) * 0.02, width: 0.006, height: 0.006 }
      : { x: 0.66, y: 0.2 + ids.indexOf(id) * 0.02, width: 0.006, height: 0.006 },
    nearbyTextSpanIds: [],
  });
  return {
    id: 'matching-1',
    kind: 'matching',
    bbox: { x: 0.1, y: 0.2, width: 0.6, height: 0.1 },
    detectionMethod: 'matching-v1',
    candidateScore: 0.9,
    cardinality: 'one-to-one',
    nearbyTextSpanIds: [],
    leftItems: [item('l1', 'left'), item('l2', 'left'), item('l3', 'left')],
    rightItems: [item('r1', 'right'), item('r2', 'right'), item('r3', 'right')],
    ...overrides,
  };
}

const EXPECTED_PAIRS = [
  { left: 'l1', right: 'r1' },
  { left: 'l2', right: 'r2' },
  { left: 'l3', right: 'r3' },
];

function renderOverlay(overrides: Record<string, unknown> = {}) {
  const base = {
    matchings: [interaction()],
    matchingAnswers: { 'matching-1': serializeMatchingAnswer({ l1: 'r1', l2: 'r3', l3: 'r2' }) },
    rotation: 0 as const,
    disabled: false,
    selection: null,
    verdictByItem: {},
    expectedPairsByItem: {},
    revealedByItem: {},
    onItemClick: vi.fn(),
    onUnpair: vi.fn(),
    onReset: vi.fn(),
  };
  return render(<MatchingOverlay {...base} {...overrides} />);
}

describe('MatchingOverlay correction feedback', () => {
  it('keeps lines neutral when no verdict exists (UNMAPPED/AMBIGUOUS)', () => {
    renderOverlay({
      verdictByItem: { 'matching-1': undefined },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
    });
    expect(document.querySelectorAll('line.matching-line-ok').length).toBe(0);
    expect(document.querySelectorAll('line.matching-line-err').length).toBe(0);
    expect(document.querySelectorAll('line.matching-line').length).toBe(3);
  });

  it('marks correct pairs with solid ok lines and wrong pairs with dashed err lines', () => {
    renderOverlay({
      verdictByItem: { 'matching-1': CorrectionVerdict.PARTIALLY_CORRECT },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
    });
    const okLines = document.querySelectorAll('line.matching-line-ok');
    const errLines = document.querySelectorAll('line.matching-line-err');
    expect(okLines.length).toBe(1);
    expect(errLines.length).toBe(2);
  });

  it('marks every pair ok for a fully correct verdict', () => {
    renderOverlay({
      matchingAnswers: { 'matching-1': serializeMatchingAnswer({ l1: 'r1', l2: 'r2', l3: 'r3' }) },
      verdictByItem: { 'matching-1': CorrectionVerdict.CORRECT },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
    });
    expect(document.querySelectorAll('line.matching-line-ok').length).toBe(3);
    expect(document.querySelectorAll('line.matching-line-err').length).toBe(0);
  });

  it('resolves source-text answer keys as well as printed item labels', () => {
    renderOverlay({
      matchingAnswers: { 'matching-1': serializeMatchingAnswer({ l1: 'r1', l2: 'r2', l3: 'r3' }) },
      verdictByItem: { 'matching-1': CorrectionVerdict.CORRECT },
      expectedPairsByItem: {
        'matching-1': [
          { left: 'item l1', right: 'item r1' },
          { left: 'item l2', right: 'item r2' },
          { left: 'item l3', right: 'item r3' },
        ],
      },
    });
    expect(document.querySelectorAll('line.matching-line-ok').length).toBe(3);
    expect(document.querySelectorAll('line.matching-line-err').length).toBe(0);
  });

  it('accepts the normalized item IDs produced by correction resolution', () => {
    const sourceInteraction = interaction();
    sourceInteraction.leftItems = sourceInteraction.leftItems.map((item, index) => ({
      ...item,
      label: String(index + 1),
    }));
    sourceInteraction.rightItems = sourceInteraction.rightItems.map((item, index) => ({
      ...item,
      label: String.fromCharCode(65 + index),
    }));
    renderOverlay({
      matchings: [sourceInteraction],
      matchingAnswers: { 'matching-1': serializeMatchingAnswer({ l1: 'r1', l2: 'r2', l3: 'r3' }) },
      verdictByItem: { 'matching-1': CorrectionVerdict.CORRECT },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
    });
    expect(document.querySelectorAll('line.matching-line-ok').length).toBe(3);
    expect(document.querySelectorAll('line.matching-line-err').length).toBe(0);
  });

  it('communicates correctness in the accessibility text, not color alone', () => {
    renderOverlay({
      verdictByItem: { 'matching-1': CorrectionVerdict.PARTIALLY_CORRECT },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
    });
    expect(screen.getByRole('button', { name: /item l1, matched to item r1, correct pair/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /item l2, matched to item r3, incorrect pair/ })).toBeTruthy();
  });

  it('draws dotted expected lines for wrong pairs once revealed', () => {
    renderOverlay({
      verdictByItem: { 'matching-1': CorrectionVerdict.PARTIALLY_CORRECT },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
      revealedByItem: { 'matching-1': true },
    });
    expect(document.querySelectorAll('line.matching-line-expected').length).toBe(2);
  });

  it('does not draw expected lines when not revealed', () => {
    renderOverlay({
      verdictByItem: { 'matching-1': CorrectionVerdict.PARTIALLY_CORRECT },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
      revealedByItem: { 'matching-1': false },
    });
    expect(document.querySelectorAll('line.matching-line-expected').length).toBe(0);
  });

  it('draws no lines at all when the learner formed no pairs', () => {
    renderOverlay({
      matchingAnswers: { 'matching-1': '' },
      verdictByItem: { 'matching-1': CorrectionVerdict.UNANSWERED },
      expectedPairsByItem: { 'matching-1': EXPECTED_PAIRS },
    });
    expect(document.querySelectorAll('line.matching-line').length).toBe(0);
  });
});
