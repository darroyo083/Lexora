// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AnswerResolutionStatus, CorrectionVerdict } from '../../state/correction';
import type { LessonProjection } from '../lesson';
import InteractiveLesson from '../InteractiveLesson';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const projection: LessonProjection = {
  status: 'AVAILABLE',
  lesson: {
    id: 'book-1:page:12',
    title: 'Satzklammer',
    unitNumber: 4,
    unitTitle: 'Satzklammer',
    source: { bookId: 'book-1', pageNumber: 12, schemaVersion: '1.4', processorEngine: 'lexora-ai', processedAt: 'now' },
    sections: [{
      id: 'source',
      heading: null,
      blocks: [{
        id: 'fill-block',
        kind: 'fill-blank',
        sourceY: 0.2,
        prompt: 'Ergänzen Sie den Satz.',
        blanks: [{ id: 'blank-1', kind: 'fill-in-line', lineBbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.01 }, interactionBbox: { x: 0.1, y: 0.19, width: 0.3, height: 0.03 }, detectionMethod: 'horizontal-line-v1', candidateScore: 0.9, nearbyTextSpanIds: [] }],
        itemPrompts: { 'blank-1': 'Ich ___ heute hier.' },
        evidence: { spanIds: [], interactionIds: ['blank-1'], bboxes: [], confidence: 0.9, detectionMethods: ['horizontal-line-v1'] },
      }],
    }],
    blockCount: 1,
    interactionCount: 1,
  },
};

function props(overrides: Record<string, unknown> = {}) {
  return {
    projection,
    pageNumber: 12,
    pageCount: 50,
    pageStage: 'READY' as const,
    failureReason: null,
    pageLoadError: null,
    correctionLoadError: null,
    answers: { 'blank-1': 'bin' },
    matchingSelection: null,
    verdictByItem: {},
    resolutionByItem: {},
    correctionDetails: {},
    reveal: {},
    expectedByItem: { 'blank-1': 'ist' },
    canCheck: true,
    onSelectPage: vi.fn(),
    onProcessPage: vi.fn(),
    onRetryPageLoad: vi.fn(),
    onRetryCorrectionLoad: vi.fn(),
    onUseClassic: vi.fn(),
    onAnswerChange: vi.fn(),
    onChoiceSelect: vi.fn(),
    onGridSelect: vi.fn(),
    onOrderingItemClick: vi.fn(),
    onMatchingItemClick: vi.fn(),
    onMatchingUnpair: vi.fn(),
    onMatchingReset: vi.fn(),
    onCheck: vi.fn(),
    onRetry: vi.fn(),
    onReveal: vi.fn(),
    ...overrides,
  };
}

describe('InteractiveLesson', () => {
  it('writes the active step through shared answer and correction callbacks', () => {
    const callbacks = props();
    render(<InteractiveLesson {...callbacks} />);

    expect(screen.getByRole('heading', { name: 'Satzklammer', level: 1 })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: 'ist' } });
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith('blank-1', 'ist');
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(callbacks.onCheck).toHaveBeenCalledWith(['blank-1']);
  });

  it('keeps retry and reveal actions scoped to the current item', () => {
    const callbacks = props({
      verdictByItem: { 'blank-1': CorrectionVerdict.INCORRECT },
      resolutionByItem: { 'blank-1': AnswerResolutionStatus.RESOLVED },
    });
    render(<InteractiveLesson {...callbacks} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(callbacks.onReveal).toHaveBeenCalledWith('blank-1');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(callbacks.onRetry).toHaveBeenCalledWith('blank-1');
  });

  it('explains fail-closed correction instead of showing a verdict', () => {
    render(<InteractiveLesson {...props({
      resolutionByItem: { 'blank-1': AnswerResolutionStatus.AMBIGUOUS },
      expectedByItem: {},
    })} />);
    expect(screen.getByText(/source answer is ambiguous/i)).toBeTruthy();
    expect(screen.queryByText('Correct')).toBeNull();
  });

  it('offers processing and Classic fallback for unavailable pages', () => {
    const callbacks = props({
      projection: { status: 'UNAVAILABLE', reason: 'ANALYSIS_UNAVAILABLE' },
      pageStage: null,
    });
    render(<InteractiveLesson {...callbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Classic' }));
    expect(callbacks.onProcessPage).toHaveBeenCalledOnce();
    expect(callbacks.onUseClassic).toHaveBeenCalledOnce();
  });

  it('keeps technical analysis failures private and exposes a learner-facing retry', () => {
    const callbacks = props({
      projection: { status: 'UNAVAILABLE', reason: 'ANALYSIS_UNAVAILABLE' },
      pageStage: 'FAILED',
      failureReason: 'OCR service timed out.',
    });
    render(<InteractiveLesson {...callbacks} />);
    expect(screen.queryByText('OCR service timed out.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'We could not prepare this lesson' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(callbacks.onProcessPage).toHaveBeenCalledOnce();
  });

  it('shows retryable page and correction request failures', () => {
    const pageCallbacks = props({
      projection: { status: 'UNAVAILABLE', reason: 'ANALYSIS_UNAVAILABLE' },
      pageLoadError: 'This page could not be loaded.',
    });
    const { unmount } = render(<InteractiveLesson {...pageCallbacks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry page' }));
    expect(pageCallbacks.onRetryPageLoad).toHaveBeenCalledOnce();
    unmount();

    const correctionCallbacks = props({ correctionLoadError: 'Correction data could not be loaded.' });
    render(<InteractiveLesson {...correctionCallbacks} />);
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Correction unavailable. Retry' }));
    expect(correctionCallbacks.onRetryCorrectionLoad).toHaveBeenCalledOnce();
  });
});
