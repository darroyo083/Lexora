// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SentenceOrderingOverlay from '../SentenceOrderingOverlay';
import type { SentenceOrderingInteraction } from '../types';
import { CorrectionVerdict } from '../../state/correction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

function interaction(
  id: string,
  texts: string[],
): SentenceOrderingInteraction {
  return {
    id,
    kind: 'sentence-ordering',
    bbox: { x: 0.15, y: 0.2, width: 0.5, height: 0.02 },
    exerciseId: 'sentence-order-exercise-1',
    promptIndex: 1,
    detectionMethod: 'sentence-ordering-v1',
    candidateScore: 0.9,
    nearbyTextSpanIds: [],
    items: texts.map((text, index) => ({
      id: `${id}-item-${index + 1}`,
      text,
      bbox: { x: 0.15 + index * 0.1, y: 0.2, width: 0.08, height: 0.02 },
      originalIndex: index + 1,
    })),
  };
}

const ITEM_IDS = ['o1-item-1', 'o1-item-2', 'o1-item-3'];
const EXPECTED_SEQUENCE = ['o1-item-1', 'o1-item-2', 'o1-item-3'];

function renderOverlay(overrides: Record<string, unknown> = {}) {
  const base = {
    sentenceOrderings: [interaction('o1', ['Er', 'geht', 'weg.'])],
    orderingAnswers: { o1: 'o1-item-1,o1-item-3,o1-item-2' },
    rotation: 0 as const,
    disabled: false,
    activePromptId: null,
    verdictByItem: {},
    expectedSequencesByItem: {},
    onFragmentClick: vi.fn(),
  };
  return render(<SentenceOrderingOverlay {...base} {...overrides} />);
}

describe('SentenceOrderingOverlay correction feedback', () => {
  it('stays neutral (no grading classes) when no verdict exists', () => {
    renderOverlay();
    expect(document.querySelectorAll('.ordering-badge').length).toBe(0);
    expect(document.querySelectorAll('.ordering-fragment-badge').length).toBe(3);
  });

  it('marks fragment badges correct/incorrect per position with a graded verdict', () => {
    renderOverlay({
      verdictByItem: { o1: CorrectionVerdict.PARTIALLY_CORRECT },
      expectedSequencesByItem: { o1: EXPECTED_SEQUENCE },
    });
    const badges = Array.from(document.querySelectorAll('.ordering-fragment-badge'));
    expect(badges.length).toBe(3);
    expect(badges[0].className).toContain('correct');
    expect(badges[1].className).toContain('incorrect');
    expect(badges[2].className).toContain('incorrect');
  });

  it('marks every badge correct for a fully correct verdict', () => {
    renderOverlay({
      orderingAnswers: { o1: ITEM_IDS.join(',') },
      verdictByItem: { o1: CorrectionVerdict.CORRECT },
      expectedSequencesByItem: { o1: EXPECTED_SEQUENCE },
    });
    const badges = Array.from(document.querySelectorAll('.ordering-fragment-badge'));
    expect(badges.every((badge) => badge.className.includes('correct'))).toBe(true);
  });

  it('communicates correctness in the accessibility text', () => {
    renderOverlay({
      verdictByItem: { o1: CorrectionVerdict.PARTIALLY_CORRECT },
      expectedSequencesByItem: { o1: EXPECTED_SEQUENCE },
    });
    expect(screen.getByRole('button', { name: /position 1 in the sentence, correct position/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /position 2 in the sentence, incorrect position/ })).toBeTruthy();
  });
});
