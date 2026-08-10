import type {
  BBox,
  ChoiceGroup,
  PageAnalysis,
  TextSpan,
} from '../reader/types';
import type {
  ContextLessonBlock,
  Lesson,
  LessonBlock,
  LessonEvidence,
  LessonProjection,
  LessonUnitContext,
  SourceParagraph,
} from './lesson';

interface ProjectLessonInput {
  bookId: string;
  pageNumber: number;
  analysis: PageAnalysis | null;
  unit?: LessonUnitContext | null;
}

interface PositionedBlock {
  sourceY: number;
  block: LessonBlock;
}

const MIN_SOURCE_CONFIDENCE = 0.55;
const CONTEXT_GAP = 0.036;
const INTERACTION_GAP = 0.055;

function top(bbox: BBox): number {
  return bbox.y;
}

function bottom(bbox: BBox): number {
  return bbox.y + bbox.height;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function spanText(spanIds: string[], spansById: Map<string, TextSpan>): string | null {
  const text = unique(spanIds)
    .map((id) => spansById.get(id))
    .filter((span): span is TextSpan => Boolean(span))
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
    .map((span) => span.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([.!?])(?:\s*\1)+/g, '$1')
    .trim();
  return text || null;
}

function evidence(
  spanIds: string[],
  interactionIds: string[],
  bboxes: BBox[],
  confidences: number[],
  detectionMethods: string[],
): LessonEvidence {
  return {
    spanIds: unique(spanIds),
    interactionIds: unique(interactionIds),
    bboxes,
    confidence: average(confidences),
    detectionMethods: unique(detectionMethods),
  };
}

function choiceGroups(groups: ChoiceGroup[]): Map<string, ChoiceGroup> {
  return new Map(groups.map((group) => [group.id, group]));
}

function groupBy<T>(values: T[], keyOf: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key);
    if (group) {
      group.push(value);
    } else {
      groups.set(key, [value]);
    }
  }
  return groups;
}

function clusterByVerticalGap<T>(
  values: T[],
  bboxOf: (value: T) => BBox,
  maximumGap = INTERACTION_GAP,
): T[][] {
  const sorted = [...values].sort((a, b) => top(bboxOf(a)) - top(bboxOf(b)));
  const clusters: T[][] = [];
  for (const value of sorted) {
    const current = clusters.at(-1);
    if (!current) {
      clusters.push([value]);
      continue;
    }
    const previous = current.at(-1);
    if (!previous || top(bboxOf(value)) - bottom(bboxOf(previous)) > maximumGap) {
      clusters.push([value]);
    } else {
      current.push(value);
    }
  }
  return clusters;
}

function interactionBlocks(analysis: PageAnalysis): PositionedBlock[] {
  const spansById = new Map(analysis.textSpans.map((span) => [span.id, span]));
  const groupsById = choiceGroups(analysis.choiceGroups);
  const blocks: PositionedBlock[] = [];

  for (const blanks of clusterByVerticalGap(analysis.exerciseBlanks, (blank) => blank.interactionBbox)) {
    const spanIds = blanks.flatMap((blank) => blank.nearbyTextSpanIds);
    const sourceY = Math.min(...blanks.map((blank) => blank.interactionBbox.y));
    blocks.push({
      sourceY,
      block: {
        id: `page-${analysis.pageNumber}-fill-${blanks[0].id}`,
        kind: 'fill-blank',
        sourceY,
        prompt: spanText(spanIds, spansById),
        blanks,
        evidence: evidence(
          spanIds,
          blanks.map((blank) => blank.id),
          blanks.map((blank) => blank.interactionBbox),
          blanks.map((blank) => blank.candidateScore),
          blanks.map((blank) => blank.detectionMethod),
        ),
      },
    });
  }

  const targetsByGroup = groupBy(
    analysis.choiceTargets,
    (target) => target.optionGroupId ?? `unmapped:${target.id}`,
  );
  for (const [groupId, targets] of targetsByGroup) {
    const spanIds = targets.flatMap((target) => target.nearbyTextSpanIds);
    const sourceY = Math.min(...targets.map((target) => target.interactionBbox.y));
    blocks.push({
      sourceY,
      block: {
        id: `page-${analysis.pageNumber}-choice-${targets[0].id}`,
        kind: 'choice',
        sourceY,
        prompt: spanText(spanIds, spansById),
        targets,
        group: groupId.startsWith('unmapped:') ? null : (groupsById.get(groupId) ?? null),
        evidence: evidence(
          spanIds,
          targets.map((target) => target.id),
          targets.map((target) => target.interactionBbox),
          targets.map((target) => target.candidateScore),
          targets.map((target) => target.detectionMethod),
        ),
      },
    });
  }

  for (const grid of analysis.choiceGrids) {
    const spanIds = grid.rows.flatMap((row) => row.nearbyTextSpanIds);
    blocks.push({
      sourceY: grid.gridBbox.y,
      block: {
        id: `page-${analysis.pageNumber}-grid-${grid.id}`,
        kind: 'choice-grid',
        sourceY: grid.gridBbox.y,
        prompt: spanText(spanIds, spansById),
        grid,
        group: groupsById.get(grid.optionGroupId) ?? null,
        evidence: evidence(
          spanIds,
          [grid.id, ...grid.rows.map((row) => row.id)],
          [grid.gridBbox, ...grid.rows.map((row) => row.rowBbox)],
          [grid.candidateScore],
          [grid.detectionMethod],
        ),
      },
    });
  }

  const orderingsByExercise = groupBy(
    analysis.sentenceOrderings,
    (ordering) => ordering.exerciseId,
  );
  for (const [exerciseId, interactions] of orderingsByExercise) {
    const spanIds = interactions.flatMap((interaction) => interaction.nearbyTextSpanIds);
    const sourceY = Math.min(...interactions.map((interaction) => interaction.bbox.y));
    blocks.push({
      sourceY,
      block: {
        id: `page-${analysis.pageNumber}-ordering-${exerciseId}`,
        kind: 'sentence-ordering',
        sourceY,
        prompt: spanText(spanIds, spansById),
        exerciseId,
        interactions: [...interactions].sort((a, b) => a.promptIndex - b.promptIndex),
        evidence: evidence(
          spanIds,
          interactions.map((interaction) => interaction.id),
          interactions.map((interaction) => interaction.bbox),
          interactions.map((interaction) => interaction.candidateScore),
          interactions.map((interaction) => interaction.detectionMethod),
        ),
      },
    });
  }

  for (const interaction of analysis.matchingInteractions) {
    const spanIds = [
      ...interaction.nearbyTextSpanIds,
      ...interaction.leftItems.flatMap((item) => item.nearbyTextSpanIds),
      ...interaction.rightItems.flatMap((item) => item.nearbyTextSpanIds),
    ];
    blocks.push({
      sourceY: interaction.bbox.y,
      block: {
        id: `page-${analysis.pageNumber}-matching-${interaction.id}`,
        kind: 'matching',
        sourceY: interaction.bbox.y,
        prompt: spanText(spanIds, spansById),
        interaction,
        evidence: evidence(
          spanIds,
          [interaction.id],
          [interaction.bbox],
          [interaction.candidateScore],
          [interaction.detectionMethod],
        ),
      },
    });
  }

  for (const interaction of analysis.freeTextInteractions) {
    const spanIds = interaction.nearbyTextSpanIds;
    blocks.push({
      sourceY: interaction.bbox.y,
      block: {
        id: `page-${analysis.pageNumber}-free-${interaction.id}`,
        kind: 'free-text',
        sourceY: interaction.bbox.y,
        prompt: spanText(spanIds, spansById),
        interaction,
        evidence: evidence(
          spanIds,
          [interaction.id],
          [interaction.bbox],
          [interaction.candidateScore],
          [interaction.detectionMethod],
        ),
      },
    });
  }

  return blocks;
}

function meaningfulSpan(span: TextSpan): boolean {
  const text = span.text.trim();
  if (span.confidence < MIN_SOURCE_CONFIDENCE || !text) return false;
  if (/^[\d\W_]+$/u.test(text)) return false;
  return text.length > 1;
}

function contextVariant(text: string): ContextLessonBlock['variant'] {
  if (/\b(beispiel|example|zum beispiel)\b/i.test(text)) return 'example';
  if (/\b(schreiben|ergänzen|ordnen|verbinden|wählen|markieren|lesen|bilden)\b/i.test(text)) {
    return 'instruction';
  }
  return 'theory';
}

function contextBlocks(
  analysis: PageAnalysis,
  positionedInteractions: PositionedBlock[],
): PositionedBlock[] {
  const interactionSpanIds = new Set(
    positionedInteractions.flatMap(({ block }) => block.evidence.spanIds),
  );
  const interactionRanges = positionedInteractions.flatMap(({ block }) => block.evidence.bboxes);
  const candidates = analysis.textSpans
    .filter(meaningfulSpan)
    .filter((span) => !interactionSpanIds.has(span.id))
    .filter((span) => {
      const center = span.bbox.y + span.bbox.height / 2;
      return !interactionRanges.some((bbox) => (
        center >= bbox.y - 0.012 && center <= bbox.y + bbox.height + 0.012
      ));
    })
    .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);

  const groups: TextSpan[][] = [];
  for (const span of candidates) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || span.bbox.y - bottom(previous.bbox) > CONTEXT_GAP || current.length >= 6) {
      groups.push([span]);
    } else {
      current.push(span);
    }
  }

  return groups.map((spans) => {
    const paragraphs: SourceParagraph[] = spans.map((span) => ({
      id: `paragraph-${span.id}`,
      text: span.text.trim(),
      spanIds: [span.id],
    }));
    const text = paragraphs.map((paragraph) => paragraph.text).join(' ');
    const sourceY = spans[0].bbox.y;
    const block: ContextLessonBlock = {
      id: `page-${analysis.pageNumber}-context-${spans[0].id}`,
      kind: 'context',
      variant: contextVariant(text),
      sourceY,
      prompt: null,
      paragraphs,
      evidence: evidence(
        spans.map((span) => span.id),
        [],
        spans.map((span) => span.bbox),
        spans.map((span) => span.confidence),
        ['ocr'],
      ),
    };
    return { sourceY, block };
  });
}

function lessonTitle(analysis: PageAnalysis, unit?: LessonUnitContext | null): string {
  if (unit?.title?.trim()) return unit.title.trim();
  const header = analysis.textSpans
    .filter(meaningfulSpan)
    .filter((span) => span.bbox.y < 0.13)
    .filter((span) => !/^(?:[ABC]\d|\d+)$/i.test(span.text.trim()))
    .sort((a, b) => a.bbox.y - b.bbox.y || b.bbox.width - a.bbox.width)
    .find((span) => span.text.trim().length >= 4);
  return header?.text.trim() || `Page ${analysis.pageNumber}`;
}

function interactionCount(blocks: LessonBlock[]): number {
  return blocks.reduce((count, block) => {
    switch (block.kind) {
      case 'context': return count;
      case 'fill-blank': return count + block.blanks.length;
      case 'choice': return count + block.targets.length;
      case 'choice-grid': return count + block.grid.rows.length;
      case 'sentence-ordering': return count + block.interactions.length;
      case 'matching':
      case 'free-text': return count + 1;
    }
  }, 0);
}

export function projectLesson({
  bookId,
  pageNumber,
  analysis,
  unit,
}: ProjectLessonInput): LessonProjection {
  if (!analysis) return { status: 'UNAVAILABLE', reason: 'ANALYSIS_UNAVAILABLE' };
  if (analysis.pageNumber !== pageNumber) {
    return { status: 'UNAVAILABLE', reason: 'SOURCE_MISMATCH' };
  }

  const interactions = interactionBlocks(analysis);
  const contexts = contextBlocks(analysis, interactions);
  const blocks = [...contexts, ...interactions]
    .sort((a, b) => a.sourceY - b.sourceY || a.block.id.localeCompare(b.block.id))
    .map(({ block }) => block);
  if (blocks.length === 0) {
    return { status: 'UNAVAILABLE', reason: 'NO_MEANINGFUL_CONTENT' };
  }

  const lesson: Lesson = {
    id: `${bookId}:page:${pageNumber}`,
    title: lessonTitle(analysis, unit),
    unitNumber: unit?.number ?? null,
    unitTitle: unit?.title?.trim() || null,
    source: {
      bookId,
      pageNumber,
      schemaVersion: analysis.schemaVersion,
      processorEngine: analysis.processor?.engine ?? 'unknown',
      processedAt: analysis.processor?.processedAt ?? '',
    },
    sections: [{
      id: `${bookId}:page:${pageNumber}:source`,
      heading: null,
      blocks,
    }],
    blockCount: blocks.length,
    interactionCount: interactionCount(blocks),
  };
  return { status: 'AVAILABLE', lesson };
}
