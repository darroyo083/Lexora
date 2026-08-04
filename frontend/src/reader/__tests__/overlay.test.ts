import { describe, expect, it } from 'vitest';
import {
  bboxPercentageStyle,
  blankInputStyle,
  choiceHitStyle,
  choiceSelectorStyle,
  choiceValueStyle,
  emptyPageInteractionState,
  gridCellHitStyle,
  gridMarkStyle,
  indexChoiceGroups,
  sortChoiceGrids,
  sortChoiceTargets,
  sortExerciseBlanks,
} from '../overlay';
import type { ChoiceGrid, ChoiceGridCell, ChoiceGroup, ChoiceTarget, ExerciseBlank } from '../types';

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

function choice(id: string, x: number, y: number): ChoiceTarget {
  return {
    id,
    kind: 'choice',
    targetBbox: { x, y, width: 0.03, height: 0.03 },
    interactionBbox: { x: x - 0.01, y: y - 0.01, width: 0.05, height: 0.05 },
    optionGroupId: 'group-1',
    detectionMethod: 'empty-ring-v1',
    candidateScore: 0.95,
    nearbyTextSpanIds: [],
  };
}

const group: ChoiceGroup = {
  id: 'group-1',
  options: [
    { id: 'group-1-1', label: '1' },
    { id: 'group-1-2', label: '2' },
  ],
};

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

  it('transforms the input bbox under 90 rotation and sizes type against it', () => {
    const exerciseBlank = blank('blank-1', 0.2, 0.3);
    expect(blankInputStyle(exerciseBlank, 1500, 90)).toEqual({
      left: '67.5%',
      top: '20%',
      width: '2.5%',
      height: '15%',
      fontSize: '162px',
    });
  });

  it('transforms the input bbox under 180 rotation', () => {
    const exerciseBlank = blank('blank-1', 0.2, 0.3);
    expect(blankInputStyle(exerciseBlank, 1500, 180)).toEqual({
      left: '65%',
      top: '67.5%',
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
});

describe('choice overlays', () => {
  it('places the hit area on the interaction bbox', () => {
    expect(choiceHitStyle(choice('choice-1', 0.2, 0.3))).toEqual({
      left: '19%',
      top: '29%',
      width: '5%',
      height: '5%',
    });
  });

  it('centers the selected value on the physical target with page-relative type size', () => {
    expect(choiceValueStyle(choice('choice-1', 0.2, 0.3), 1500)).toEqual({
      left: '20%',
      top: '30%',
      width: '3%',
      height: '3%',
      fontSize: '36px',
      lineHeight: '45px',
    });
  });

  it('anchors the selector below targets in the upper part of the page', () => {
    const style = choiceSelectorStyle(choice('choice-1', 0.2, 0.3), 1500) as Record<string, string>;
    expect(style.left).toBe('21.5%');
    expect(style.top).toBe('33.2667%');
    expect(style.transform).toBe('translateX(-50%)');
    expect(style.bottom).toBeUndefined();
  });

  it('anchors the selector above targets near the bottom of the page', () => {
    const style = choiceSelectorStyle(choice('choice-1', 0.2, 0.9), 1500) as Record<string, string>;
    expect(style.left).toBe('21.5%');
    expect(style.bottom).toBe('10%');
    expect(style.top).toBeUndefined();
  });

  it('moves the hit area with the target under 90 rotation', () => {
    expect(choiceHitStyle(choice('choice-1', 0.2, 0.3), 90)).toEqual({
      left: '66%',
      top: '19%',
      width: '5%',
      height: '5%',
    });
  });

  it('anchors the selector relative to the rotated target', () => {
    const style = choiceSelectorStyle(choice('choice-1', 0.2, 0.3), 1500, 90) as Record<string, string>;
    expect(style.left).toBe('68.5%');
    expect(style.top).toBe('23.2667%');
  });

  it('sorts targets top-to-bottom then left-to-right', () => {
    const sorted = sortChoiceTargets([
      choice('choice-2', 0.4, 0.5),
      choice('choice-1', 0.1, 0.2),
      choice('choice-3', 0.7, 0.2),
    ]);
    expect(sorted.map(({ id }) => id)).toEqual(['choice-1', 'choice-3', 'choice-2']);
  });

  it('indexes choice groups by id for lookup', () => {
    expect(indexChoiceGroups([group])).toEqual({ 'group-1': group });
  });
});

function cell(id: string, x: number, y: number): ChoiceGridCell {
  return {
    id,
    optionId: `grid-group-1-ja`,
    cellBbox: { x, y, width: 0.1, height: 0.04 },
    interactionBbox: { x, y, width: 0.1, height: 0.04 },
  };
}

function grid(id: string, y: number): ChoiceGrid {
  return {
    id,
    kind: 'choice-grid',
    gridBbox: { x: 0.2, y, width: 0.6, height: 0.2 },
    optionGroupId: 'grid-group-1',
    detectionMethod: 'table-grid-v1',
    candidateScore: 0.9,
    rows: [],
  };
}

describe('grid overlays', () => {
  it('places the radio hit area on the cell interaction bbox', () => {
    expect(gridCellHitStyle(cell('c1', 0.3, 0.4))).toEqual({
      left: '30%',
      top: '40%',
      width: '10%',
      height: '4%',
    });
  });

  it('centers the mark on the physical cell with page-relative size', () => {
    expect(gridMarkStyle(cell('c1', 0.3, 0.4), 1500)).toEqual({
      left: '30%',
      top: '40%',
      width: '10%',
      height: '4%',
      fontSize: '43.2px',
      lineHeight: '60px',
    });
  });

  it('moves the cell hit area and mark together under 270 rotation', () => {
    const rotatedCell = cell('c1', 0.3, 0.4);
    expect(gridCellHitStyle(rotatedCell, 270)).toEqual({
      left: '40%',
      top: '60%',
      width: '4%',
      height: '10%',
    });
    expect(gridMarkStyle(rotatedCell, 1500, 270)).toEqual({
      left: '40%',
      top: '60%',
      width: '4%',
      height: '10%',
      fontSize: '108px',
      lineHeight: '150px',
    });
  });

  it('sorts grids top-to-bottom', () => {
    expect(sortChoiceGrids([grid('g2', 0.5), grid('g1', 0.1)]).map(({ id }) => id))
      .toEqual(['g1', 'g2']);
  });
});

describe('interaction state', () => {
  it('creates a fully cleared interaction state for a page change', () => {
    expect(emptyPageInteractionState()).toEqual({
      spans: [],
      blanks: [],
      choices: [],
      choiceGroups: {},
      grids: [],
      answers: {},
      schemaVersion: '',
      selectedSpan: null,
      selectedBlank: null,
      selectedChoice: null,
    });
  });
});
