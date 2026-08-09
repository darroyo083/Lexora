// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OrderingControls from '../OrderingControls';
import type { SentenceOrderingInteraction } from '../types';
import { CorrectionVerdict } from '../../state/correction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

function interaction(id: string, texts: string[]): SentenceOrderingInteraction {
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

const ACTIVE = interaction('o1', ['Er', 'geht', 'weg.']);

function renderControls(overrides: Record<string, unknown> = {}) {
  const base = {
    active: ACTIVE,
    siblings: [ACTIVE],
    promptIndex: 1,
    ordered: ['o1-item-1', 'o1-item-3', 'o1-item-2'],
    disabled: false,
    verdict: undefined,
    expected: undefined,
    onPromptChange: vi.fn(),
    onOrderingChange: vi.fn(),
  };
  return render(<OrderingControls {...base} {...overrides} />);
}

describe('OrderingControls correction feedback', () => {
  it('keeps chips neutral without a graded verdict', () => {
    renderControls();
    expect(document.querySelectorAll('.ordering-chip-correct').length).toBe(0);
    expect(document.querySelectorAll('.ordering-chip-incorrect').length).toBe(0);
  });

  it('marks chips correct/incorrect per position with a graded verdict', () => {
    renderControls({
      verdict: CorrectionVerdict.PARTIALLY_CORRECT,
      expected: ['o1-item-1', 'o1-item-2', 'o1-item-3'],
    });
    expect(document.querySelectorAll('.ordering-chip-correct').length).toBe(1);
    expect(document.querySelectorAll('.ordering-chip-incorrect').length).toBe(2);
  });

  it('communicates position correctness in the accessibility text', () => {
    renderControls({
      verdict: CorrectionVerdict.PARTIALLY_CORRECT,
      expected: ['o1-item-1', 'o1-item-2', 'o1-item-3'],
    });
    expect(screen.getByRole('button', { name: /Er — position 1\. Correct position\./ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /weg\. — position 2\. Incorrect position\./ })).toBeTruthy();
  });

  it('ignores the expected sequence when the verdict is neutral (UNANSWERED)', () => {
    renderControls({
      verdict: CorrectionVerdict.UNANSWERED,
      expected: ['o1-item-1', 'o1-item-2', 'o1-item-3'],
    });
    expect(document.querySelectorAll('.ordering-chip-correct').length).toBe(0);
    expect(document.querySelectorAll('.ordering-chip-incorrect').length).toBe(0);
  });
});
