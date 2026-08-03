import type { BBox, ChoiceGroup, ChoiceTarget, ExerciseBlank, TextSpan } from './types';

export interface PageInteractionState {
  spans: TextSpan[];
  blanks: ExerciseBlank[];
  choices: ChoiceTarget[];
  choiceGroups: Record<string, ChoiceGroup>;
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

export function bboxPercentageStyle(bbox: BBox) {
  return {
    left: `${percent(bbox.x)}%`,
    top: `${percent(bbox.y)}%`,
    width: `${percent(bbox.width)}%`,
    height: `${percent(bbox.height)}%`,
  };
}

function percent(value: number): number {
  return Math.round(value * 100 * 10000) / 10000;
}

export function blankInputStyle(blank: ExerciseBlank, viewportHeight: number) {
  return {
    ...bboxPercentageStyle(blank.interactionBbox),
    fontSize: `${blank.interactionBbox.height * viewportHeight * 0.72}px`,
  };
}

export function choiceHitStyle(choice: ChoiceTarget) {
  return bboxPercentageStyle(choice.interactionBbox);
}

export function choiceValueStyle(choice: ChoiceTarget, viewportHeight: number) {
  return {
    ...bboxPercentageStyle(choice.targetBbox),
    fontSize: `${choice.targetBbox.height * viewportHeight * 0.8}px`,
    lineHeight: `${choice.targetBbox.height * viewportHeight}px`,
  };
}

export function choiceSelectorStyle(choice: ChoiceTarget, viewportHeight: number) {
  const centerX = choice.targetBbox.x + choice.targetBbox.width / 2;
  const openBelow = choice.targetBbox.y + choice.targetBbox.height < 0.72;
  const gap = 4 / Math.max(viewportHeight, 1);
  return {
    left: `${percent(centerX)}%`,
    ...(openBelow
      ? { top: `${percent(choice.targetBbox.y + choice.targetBbox.height + gap)}%` }
      : { bottom: `${percent(1 - choice.targetBbox.y)}%` }),
    transform: 'translateX(-50%)',
  };
}
