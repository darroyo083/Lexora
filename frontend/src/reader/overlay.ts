import type { BBox, ChoiceGrid, ChoiceGridCell, ChoiceGroup, ChoiceTarget, ExerciseBlank, TextSpan } from './types';
import { rotateBBox, type PageRotation } from './rotation';

export interface PageInteractionState {
  spans: TextSpan[];
  blanks: ExerciseBlank[];
  choices: ChoiceTarget[];
  choiceGroups: Record<string, ChoiceGroup>;
  grids: ChoiceGrid[];
  answers: Record<string, string>;
  schemaVersion: string;
  selectedSpan: TextSpan | null;
  selectedBlank: ExerciseBlank | null;
  selectedChoice: ChoiceTarget | null;
}

export function emptyPageInteractionState(): PageInteractionState {
  return {
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
  };
}

export function sortExerciseBlanks(blanks: ExerciseBlank[]): ExerciseBlank[] {
  return [...blanks].sort((a, b) => (
    a.lineBbox.y - b.lineBbox.y
    || a.lineBbox.x - b.lineBbox.x
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  ));
}

export function sortChoiceTargets(choices: ChoiceTarget[]): ChoiceTarget[] {
  return [...choices].sort((a, b) => (
    a.targetBbox.y - b.targetBbox.y
    || a.targetBbox.x - b.targetBbox.x
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  ));
}

export function indexChoiceGroups(groups: ChoiceGroup[]): Record<string, ChoiceGroup> {
  return Object.fromEntries(groups.map((group) => [group.id, group]));
}

export function bboxPercentageStyle(bbox: BBox, rotation: PageRotation = 0) {
  const rotated = rotateBBox(bbox, rotation);
  return {
    left: `${percent(rotated.x)}%`,
    top: `${percent(rotated.y)}%`,
    width: `${percent(rotated.width)}%`,
    height: `${percent(rotated.height)}%`,
  };
}

function percent(value: number): number {
  return Math.round(value * 100 * 10000) / 10000;
}

export function blankInputStyle(
  blank: ExerciseBlank,
  viewportHeight: number,
  rotation: PageRotation = 0,
) {
  const interaction = rotateBBox(blank.interactionBbox, rotation);
  return {
    ...bboxPercentageStyle(interaction),
    fontSize: `${interaction.height * viewportHeight * 0.72}px`,
  };
}

export function choiceHitStyle(choice: ChoiceTarget, rotation: PageRotation = 0) {
  return bboxPercentageStyle(choice.interactionBbox, rotation);
}

export function choiceValueStyle(
  choice: ChoiceTarget,
  viewportHeight: number,
  rotation: PageRotation = 0,
) {
  const target = rotateBBox(choice.targetBbox, rotation);
  return {
    ...bboxPercentageStyle(target),
    fontSize: `${target.height * viewportHeight * 0.8}px`,
    lineHeight: `${target.height * viewportHeight}px`,
  };
}

export function choiceSelectorStyle(
  choice: ChoiceTarget,
  viewportHeight: number,
  rotation: PageRotation = 0,
) {
  const target = rotateBBox(choice.targetBbox, rotation);
  const centerX = target.x + target.width / 2;
  const openBelow = target.y + target.height < 0.72;
  const gap = 4 / Math.max(viewportHeight, 1);
  return {
    left: `${percent(centerX)}%`,
    ...(openBelow
      ? { top: `${percent(target.y + target.height + gap)}%` }
      : { bottom: `${percent(1 - target.y)}%` }),
    transform: 'translateX(-50%)',
  };
}

export function gridCellHitStyle(cell: ChoiceGridCell, rotation: PageRotation = 0) {
  return bboxPercentageStyle(cell.interactionBbox, rotation);
}

export function gridMarkStyle(
  cell: ChoiceGridCell,
  viewportHeight: number,
  rotation: PageRotation = 0,
) {
  const cellBbox = rotateBBox(cell.cellBbox, rotation);
  return {
    ...bboxPercentageStyle(cellBbox),
    fontSize: `${Math.round(cellBbox.height * viewportHeight * 0.72 * 100) / 100}px`,
    lineHeight: `${Math.round(cellBbox.height * viewportHeight * 100) / 100}px`,
  };
}

export function sortChoiceGrids(grids: ChoiceGrid[]): ChoiceGrid[] {
  return [...grids].sort((a, b) => (
    a.gridBbox.y - b.gridBbox.y
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  ));
}
