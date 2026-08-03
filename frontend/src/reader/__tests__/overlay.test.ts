import { describe, expect, it } from 'vitest';
import {
  bboxPercentageStyle,
  blankInputStyle,
  emptyPageInteractionState,
  sortExerciseBlanks,
} from '../overlay';
import type { ExerciseBlank } from '../types';

function blank(id: string, x: number, y: number): ExerciseBlank {
  return {
    id,
    kind: 'fill-in-line',
    lineBbox: { x: x + 0.01, y: y + 0.02, width: 0.1, height: 0.004 },
    interactionBbox: { x, y, width: 0.15, height: 0.025 },
    detectionMethod: 'horizontal-line-v1',
    candidateScore: 0.9,
    nearbyTextSpanIds: [],
  };
}

describe('blank overlays', () => {
  it('maps normalized geometry into the existing percentage coordinate space', () => {
    expect(bboxPercentageStyle({ x: 0.2, y: 0.3, width: 0.4, height: 0.05 })).toEqual({
      left: '20%',
      top: '30%',
      width: '40%',
      height: '5%',
    });
  });

  it('uses the interaction bbox for input placement and page-relative type size', () => {
    const exerciseBlank = blank('blank-1', 0.2, 0.3);
    expect(blankInputStyle(exerciseBlank, 1500)).toEqual({
      left: '20%',
      top: '30%',
      width: '15%',
      height: '2.5%',
      fontSize: '27px',
    });
  });

  it('sorts input order top-to-bottom, then left-to-right, with a natural id tie-break', () => {
    const sorted = sortExerciseBlanks([
      blank('blank-10', 0.4, 0.5),
      blank('blank-2', 0.4, 0.5),
      blank('blank-3', 0.7, 0.2),
      blank('blank-1', 0.1, 0.2),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual(['blank-1', 'blank-3', 'blank-2', 'blank-10']);
  });

  it('creates a fully cleared interaction state for a page change', () => {
    expect(emptyPageInteractionState()).toEqual({
      spans: [],
      blanks: [],
      answers: {},
      schemaVersion: '',
      selectedSpan: null,
      selectedBlank: null,
    });
  });
});
