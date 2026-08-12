import type {
  BBox,
  ChoiceGroup,
  PageAnalysis,
  SemanticExercise,
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
const MIN_STANDALONE_CONTEXT_CHARS = 120;

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

function commonPrompt(prompts: Array<string | null>): string | null {
  const meaningful = unique(prompts.filter((prompt): prompt is string => Boolean(prompt)));
  return meaningful.length === 1 ? meaningful[0] : null;
}

function localSpanText(
  spanIds: string[],
  interactionBbox: BBox,
  spansById: Map<string, TextSpan>,
): string | null {
  const candidates = unique(spanIds)
    .map((id) => spansById.get(id))
    .filter((span): span is TextSpan => Boolean(span))
    .filter(meaningfulSpan);
  if (candidates.length === 0) return null;

  const interactionTop = interactionBbox.y - 0.012;
  const interactionBottom = bottom(interactionBbox) + 0.012;
  const sameLine = candidates.filter((span) => (
    bottom(span.bbox) >= interactionTop && span.bbox.y <= interactionBottom
  ));
  if (sameLine.length > 0) {
    const centerX = interactionBbox.x + interactionBbox.width / 2;
    const centerY = interactionBbox.y + interactionBbox.height / 2;
    const closest = [...sameLine].sort((a, b) => {
      const horizontalDistance = (span: TextSpan) => (
        centerX < span.bbox.x
          ? span.bbox.x - centerX
          : centerX > span.bbox.x + span.bbox.width
            ? centerX - span.bbox.x - span.bbox.width
            : 0
      );
      return horizontalDistance(a) - horizontalDistance(b)
        || Math.abs(a.bbox.y + a.bbox.height / 2 - centerY)
          - Math.abs(b.bbox.y + b.bbox.height / 2 - centerY)
        || a.bbox.width - b.bbox.width;
    })[0];
    return spanText([closest.id], spansById);
  }

  const center = interactionBbox.y + interactionBbox.height / 2;
  const ranked = candidates
    .map((span) => ({ span, distance: Math.abs(span.bbox.y + span.bbox.height / 2 - center) }))
    .sort((a, b) => a.distance - b.distance);
  return spanText([ranked[0].span.id], spansById);
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
    const itemPrompts = Object.fromEntries(
      blanks.map((blank) => [
        blank.id,
        localSpanText(blank.nearbyTextSpanIds, blank.interactionBbox, spansById),
      ]),
    );
    const sourceY = Math.min(...blanks.map((blank) => blank.interactionBbox.y));
    blocks.push({
      sourceY,
      block: {
        id: `page-${analysis.pageNumber}-fill-${blanks[0].id}`,
        kind: 'fill-blank',
        sourceY,
        prompt: commonPrompt(Object.values(itemPrompts)),
        blanks,
        itemPrompts,
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
    const itemPrompts = Object.fromEntries(
      targets.map((target) => [
        target.id,
        localSpanText(target.nearbyTextSpanIds, target.interactionBbox, spansById),
      ]),
    );
    const sourceY = Math.min(...targets.map((target) => target.interactionBbox.y));
    blocks.push({
      sourceY,
      block: {
        id: `page-${analysis.pageNumber}-choice-${targets[0].id}`,
        kind: 'choice',
        sourceY,
        prompt: commonPrompt(Object.values(itemPrompts)),
        targets,
        group: groupId.startsWith('unmapped:') ? null : (groupsById.get(groupId) ?? null),
        itemPrompts,
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
    const rowPrompts = Object.fromEntries(
      grid.rows.map((row) => [
        row.id,
        localSpanText(row.nearbyTextSpanIds, row.rowBbox, spansById),
      ]),
    );
    blocks.push({
      sourceY: grid.gridBbox.y,
      block: {
        id: `page-${analysis.pageNumber}-grid-${grid.id}`,
        kind: 'choice-grid',
        sourceY: grid.gridBbox.y,
        prompt: commonPrompt(Object.values(rowPrompts)),
        grid,
        group: groupsById.get(grid.optionGroupId) ?? null,
        rowPrompts,
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
        prompt: interactions.length === 1 ? spanText(spanIds, spansById) : null,
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
        prompt: null,
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
    .filter((span) => span.bbox.y < 0.2)
    .filter((span) => !/^(?:[ABC]\d|\d+|lektion\s+\d+)$/i.test(span.text.trim()))
    .filter((span) => !/deutsch\s+(?:entdecken|a1)/i.test(span.text.trim()))
    .sort((a, b) => b.bbox.height - a.bbox.height || b.bbox.width - a.bbox.width)
    .find((span) => span.text.trim().length >= 4);
  return header?.text.trim() || `Page ${analysis.pageNumber}`;
}

function semanticExerciseForBlock(
  block: LessonBlock,
  byInteractionId: Map<string, SemanticExercise>,
): SemanticExercise | null {
  const matches = unique(block.evidence.interactionIds)
    .map((id) => byInteractionId.get(id))
    .filter((exercise): exercise is SemanticExercise => Boolean(exercise));
  if (matches.length === 0) return null;
  return matches.every((exercise) => exercise.id === matches[0].id) ? matches[0] : null;
}

function applySemanticExercises(
  analysis: PageAnalysis,
  blocks: PositionedBlock[],
): PositionedBlock[] {
  const spansById = new Map(analysis.textSpans.map((span) => [span.id, span]));
  const byInteractionId = new Map<string, SemanticExercise>();
  for (const exercise of analysis.semanticExercises ?? []) {
    for (const interactionId of exercise.interactionIds) byInteractionId.set(interactionId, exercise);
  }
  return blocks.map(({ sourceY, block }) => {
    const semantic = semanticExerciseForBlock(block, byInteractionId);
    if (!semantic) return { sourceY, block };
    const interactionSpanIds = new Set(block.evidence.spanIds);
    const repeatedCopy = new Set([
      semantic.number,
      semantic.title,
      semantic.instruction,
      `${semantic.number} ${semantic.title}`,
    ].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLocaleLowerCase()));
    if ((block.kind === 'choice' || block.kind === 'choice-grid') && block.group) {
      for (const option of block.group.options) repeatedCopy.add(option.label.trim().toLocaleLowerCase());
    }
    const semanticContextSpans = semantic.contextSpanIds
      .map((id) => spansById.get(id))
      .filter((span): span is TextSpan => (
        span !== undefined
        && meaningfulSpan(span)
        && !interactionSpanIds.has(span.id)
        && !repeatedCopy.has(span.text.trim().toLocaleLowerCase())
        && !/^\([^)]{1,30}\)$/.test(span.text.trim())
      ))
      .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
    const assignedContextIds = new Set<string>();
    let semanticBlock = block;
    if (block.kind === 'choice') {
      const itemPrompts = { ...block.itemPrompts };
      for (const target of block.targets) {
        const preceding = semanticContextSpans
          .filter((span) => span.bbox.y <= target.interactionBbox.y)
          .sort((a, b) => b.bbox.y - a.bbox.y)[0];
        if (preceding) {
          itemPrompts[target.id] = preceding.text.trim();
          assignedContextIds.add(preceding.id);
        }
      }
      semanticBlock = { ...block, itemPrompts };
    }
    const contextParagraphs = semanticContextSpans
      .filter((span) => !assignedContextIds.has(span.id))
      .map((span) => ({ id: `paragraph-${span.id}`, text: span.text.trim(), spanIds: [span.id] }));
    return {
      sourceY,
      block: {
        ...semanticBlock,
        exerciseId: semantic.id,
        exerciseNumber: semantic.number,
        exerciseTitle: semantic.title,
        instruction: semantic.instruction,
        sourceOrder: semantic.sourceOrder,
        contextParagraphs,
      },
    };
  });
}

function coalesceSemanticChoiceExercises(blocks: PositionedBlock[]): PositionedBlock[] {
  const grouped = new Map<string, PositionedBlock[]>();
  const passthrough: PositionedBlock[] = [];
  for (const positioned of blocks) {
    const { block } = positioned;
    if (block.kind !== 'choice' || !block.exerciseId) {
      passthrough.push(positioned);
      continue;
    }
    const group = grouped.get(block.exerciseId) ?? [];
    group.push(positioned);
    grouped.set(block.exerciseId, group);
  }
  for (const exerciseBlocks of grouped.values()) {
    if (exerciseBlocks.length === 1) {
      passthrough.push(exerciseBlocks[0]);
      continue;
    }
    const choices = exerciseBlocks.map(({ block }) => {
      if (block.kind !== 'choice') throw new Error('Expected a choice block');
      return block;
    });
    const first = choices[0];
    const groupsByTarget = Object.fromEntries(choices.flatMap((choice) => (
      choice.targets.map((target) => [target.id, choice.groupsByTarget?.[target.id] ?? choice.group])
    )));
    const itemPrompts = Object.assign({}, ...choices.map((choice) => choice.itemPrompts));
    const promptCopy = new Set(Object.values(itemPrompts)
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase()));
    const contextParagraphs = choices
      .flatMap((choice) => choice.contextParagraphs ?? [])
      .filter((paragraph) => !promptCopy.has(paragraph.text.trim().toLocaleLowerCase()))
      .filter((paragraph, index, all) => all.findIndex((item) => item.text === paragraph.text) === index);
    const sharedGroup = choices.every((choice) => choice.group?.id === first.group?.id)
      ? first.group : null;
    const confidences = choices
      .map((choice) => choice.evidence.confidence)
      .filter((confidence): confidence is number => confidence !== null);
    passthrough.push({
      sourceY: Math.min(...exerciseBlocks.map(({ sourceY }) => sourceY)),
      block: {
        ...first,
        id: first.exerciseId ?? first.id,
        targets: choices.flatMap((choice) => choice.targets),
        group: sharedGroup,
        groupsByTarget,
        itemPrompts,
        contextParagraphs,
        evidence: {
          spanIds: unique(choices.flatMap((choice) => choice.evidence.spanIds)),
          interactionIds: unique(choices.flatMap((choice) => choice.evidence.interactionIds)),
          bboxes: choices.flatMap((choice) => choice.evidence.bboxes),
          confidence: confidences.length > 0 ? Math.min(...confidences) : null,
          detectionMethods: unique(choices.flatMap((choice) => choice.evidence.detectionMethods)),
        },
      },
    });
  }
  return passthrough;
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

function hasMeaningfulStandaloneContext(contexts: PositionedBlock[]): boolean {
  const sourceBackedText = contexts
    .map(({ block }) => block)
    .filter((block): block is ContextLessonBlock => block.kind === 'context')
    .filter((block) => block.variant === 'theory' || block.variant === 'example')
    .flatMap((block) => block.paragraphs)
    .map((paragraph) => paragraph.text.trim())
    .filter(Boolean);
  return sourceBackedText.length >= 2
    && sourceBackedText.join(' ').length >= MIN_STANDALONE_CONTEXT_CHARS;
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

  const interactions = coalesceSemanticChoiceExercises(
    applySemanticExercises(analysis, interactionBlocks(analysis)),
  );
  const contexts = contextBlocks(analysis, interactions);
  if (interactions.length === 0 && !hasMeaningfulStandaloneContext(contexts)) {
    return { status: 'UNAVAILABLE', reason: 'NO_MEANINGFUL_CONTENT' };
  }
  const projected = interactions.length > 0 ? interactions : contexts;
  const blocks = projected
    .sort((a, b) => (a.block.sourceOrder ?? Number.MAX_SAFE_INTEGER)
      - (b.block.sourceOrder ?? Number.MAX_SAFE_INTEGER)
      || a.sourceY - b.sourceY || a.block.id.localeCompare(b.block.id))
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
