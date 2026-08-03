import type { BBox, ExerciseBlank, TextSpan } from './types';

export interface PageInteractionState {
  spans: TextSpan[];
  blanks: ExerciseBlank[];
  answers: Record<string, string>;
  schemaVersion: string;
  selectedSpan: TextSpan | null;
  selectedBlank: ExerciseBlank | null;
}

export function emptyPageInteractionState(): PageInteractionState {
  return {
    spans: [],
    blanks: [],
    answers: {},
    schemaVersion: '',
    selectedSpan: null,
    selectedBlank: null,
  };
}

export function sortExerciseBlanks(blanks: ExerciseBlank[]): ExerciseBlank[] {
  return [...blanks].sort((a, b) => (
    a.lineBbox.y - b.lineBbox.y
    || a.lineBbox.x - b.lineBbox.x
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  ));
}

export function bboxPercentageStyle(bbox: BBox) {
  return {
    left: `${bbox.x * 100}%`,
    top: `${bbox.y * 100}%`,
    width: `${bbox.width * 100}%`,
    height: `${bbox.height * 100}%`,
  };
}

export function blankInputStyle(blank: ExerciseBlank, viewportHeight: number) {
  return {
    ...bboxPercentageStyle(blank.interactionBbox),
    fontSize: `${blank.interactionBbox.height * viewportHeight * 0.72}px`,
  };
}
