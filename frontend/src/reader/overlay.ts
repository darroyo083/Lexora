import type { BBox, ChoiceGrid, ChoiceGridCell, ChoiceGroup, ChoiceTarget, ExerciseBlank, FreeTextInteraction, MatchingInteraction, SentenceOrderingInteraction, TextSpan } from './types';
import { rotateBBox, type PageRotation } from './rotation';

export interface PageInteractionState {
  spans: TextSpan[];
  blanks: ExerciseBlank[];
  choices: ChoiceTarget[];
  choiceGroups: Record<string, ChoiceGroup>;
  grids: ChoiceGrid[];
  sentenceOrderings: SentenceOrderingInteraction[];
  matchings: MatchingInteraction[];
  freeTexts: FreeTextInteraction[];
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
    sentenceOrderings: [],
    matchings: [],
    freeTexts: [],
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

export function sortSentenceOrderings(orderings: SentenceOrderingInteraction[]): SentenceOrderingInteraction[] {
  return [...orderings].sort((a, b) => (
    a.promptIndex - b.promptIndex
    || a.bbox.y - b.bbox.y
    || a.bbox.x - b.bbox.x
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  ));
}

export function groupSentenceOrderings(
  orderings: SentenceOrderingInteraction[],
): Record<string, SentenceOrderingInteraction[]> {
  const groups: Record<string, SentenceOrderingInteraction[]> = {};
  for (const interaction of sortSentenceOrderings(orderings)) {
    const list = groups[interaction.exerciseId] ?? [];
    list.push(interaction);
    groups[interaction.exerciseId] = list;
  }
  return groups;
}

export function sortMatchingInteractions(
  matchings: MatchingInteraction[],
): MatchingInteraction[] {
  return [...matchings].sort((a, b) => (
    a.bbox.y - b.bbox.y
    || a.bbox.x - b.bbox.x
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  ));
}

export function sortFreeTextInteractions(
  freeTexts: FreeTextInteraction[],
): FreeTextInteraction[] {
  return [...freeTexts].sort((a, b) => (
    a.bbox.y - b.bbox.y
    || a.bbox.x - b.bbox.x
    || a.id.localeCompare(b.id, undefined, { numeric: true })
  ));
}

/**
 * Input placement for a FreeText writing area.
 *
 * Single response line: a single-line input centered on the printed line with
 * a comfortable page-relative writing band. Multiple lines: one textarea over
 * the whole writing area whose line height matches the printed line spacing,
 * so typed text lands on the printed lines and zoom/rotation are handled by
 * the shared normalized geometry like every other overlay.
 */
export function freeTextInputStyle(
  interaction: FreeTextInteraction,
  viewportHeight: number,
  rotation: PageRotation = 0,
) {
  const box = rotateBBox(interaction.bbox, rotation);
  if (interaction.responseLines.length <= 1) {
    const band = Math.max(0.025, box.height);
    return {
      left: `${percent(box.x)}%`,
      top: `${percent(box.y - (band - box.height) / 2)}%`,
      width: `${percent(box.width)}%`,
      height: `${percent(band)}%`,
      fontSize: `${Math.round(band * viewportHeight * 0.72 * 100) / 100}px`,
      lineHeight: `${Math.round(band * viewportHeight * 100) / 100}px`,
    };
  }
  const band = box.height / interaction.responseLines.length;
  return {
    left: `${percent(box.x)}%`,
    top: `${percent(box.y)}%`,
    width: `${percent(box.width)}%`,
    height: `${percent(box.height)}%`,
    fontSize: `${Math.round(band * viewportHeight * 0.72 * 100) / 100}px`,
    lineHeight: `${Math.round(band * viewportHeight * 100) / 100}px`,
  };
}

/**
 * Connection endpoint of a matching item in normalized [0,1] coordinates.
 *
 * Prefers the printed anchor dot; items whose anchor OCR missed fall back to
 * the text edge facing the other column, so the connection line never runs
 * through the item text.
 */
export function matchingEndpoint(
  item: { bbox: BBox; anchorBbox: BBox | null; id: string },
  side: 'left' | 'right',
  rotation: PageRotation = 0,
): { x: number; y: number } {
  if (item.anchorBbox) {
    const anchor = rotateBBox(item.anchorBbox, rotation);
    return {
      x: anchor.x + anchor.width / 2,
      y: anchor.y + anchor.height / 2,
    };
  }
  const bbox = rotateBBox(item.bbox, rotation);
  return side === 'left'
    ? { x: bbox.x + bbox.width, y: bbox.y + bbox.height / 2 }
    : { x: bbox.x, y: bbox.y + bbox.height / 2 };
}

/**
 * Hit area style for a matching item in the rotated viewport.
 *
 * Extends the printed text box toward the item's anchor so the printed
 * connection dot itself is clickable, with a small pad on the other sides.
 * Anchors always sit between the two columns, so the extension can never
 * cross into the opposite column.
 */
export function matchingHitStyle(
  item: { bbox: BBox; anchorBbox: BBox | null },
  side: 'left' | 'right',
  rotation: PageRotation = 0,
) {
  const bbox = rotateBBox(item.bbox, rotation);
  const pad = 0.004;
  let { x, y, width, height } = bbox;
  if (item.anchorBbox) {
    const anchor = rotateBBox(item.anchorBbox, rotation);
    const anchorCenterX = anchor.x + anchor.width / 2;
    if (side === 'left') {
      width = Math.max(width, anchorCenterX - x + pad);
    } else {
      const right = x + width;
      x = Math.min(x, anchorCenterX - pad);
      width = right - x;
    }
  } else if (side === 'left') {
    width += pad * 2;
  } else {
    x -= pad * 2;
    width += pad * 2;
  }
  return {
    left: `${percent(x)}%`,
    top: `${percent(y)}%`,
    width: `${percent(width)}%`,
    height: `${percent(height)}%`,
  };
}
