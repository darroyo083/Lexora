import type {
  ContextLessonBlock,
  Lesson,
  LessonBlock,
} from './lesson';
import { parseMatchingAnswer } from '../reader/matching';
import { parseOrderedAnswer } from '../reader/ordering';

type ActivityBlock = Exclude<LessonBlock, ContextLessonBlock>;

export interface ContextLessonStep {
  id: string;
  kind: 'context';
  block: ContextLessonBlock;
  paragraphs: ContextLessonBlock['paragraphs'];
  partIndex: number;
  partCount: number;
}

export interface ActivityLessonStep {
  id: string;
  kind: 'activity';
  block: ActivityBlock;
  activityIndex: number;
  activityCount: number;
  itemIndex: number;
  itemCount: number;
  answerItemIds: string[];
  requiredAnswerIds: string[];
  correctionItemIds: string[];
}

export interface CompletionLessonStep {
  id: string;
  kind: 'completion';
  activityCount: number;
  interactionCount: number;
}

export type LessonStep = ContextLessonStep | ActivityLessonStep | CompletionLessonStep;

const CONTEXT_CHUNK_CHAR_LIMIT = 520;
const CONTEXT_CHUNK_PARAGRAPH_LIMIT = 2;

function splitContext(block: ContextLessonBlock): ContextLessonBlock['paragraphs'][] {
  const chunks: ContextLessonBlock['paragraphs'][] = [];
  let current: ContextLessonBlock['paragraphs'] = [];
  let characters = 0;

  for (const paragraph of block.paragraphs) {
    const nextCharacters = characters + paragraph.text.length;
    if (
      current.length > 0
      && (current.length >= CONTEXT_CHUNK_PARAGRAPH_LIMIT || nextCharacters > CONTEXT_CHUNK_CHAR_LIMIT)
    ) {
      chunks.push(current);
      current = [];
      characters = 0;
    }
    current.push(paragraph);
    characters += paragraph.text.length;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function activityItemCount(block: ActivityBlock): number {
  switch (block.kind) {
    case 'fill-blank': return block.blanks.length;
    case 'choice': return block.targets.length;
    case 'choice-grid': return block.grid.rows.length;
    case 'sentence-ordering': return block.interactions.length;
    case 'matching':
    case 'free-text': return 1;
  }
}

function activityStep(
  block: ActivityBlock,
  activityIndex: number,
  activityCount: number,
  itemIndex: number,
): ActivityLessonStep {
  const itemCount = activityItemCount(block);

  switch (block.kind) {
    case 'fill-blank': {
      const item = block.blanks[itemIndex];
      return {
        id: `${block.id}:item:${item.id}`,
        kind: 'activity',
        block,
        activityIndex,
        activityCount,
        itemIndex,
        itemCount,
        answerItemIds: [item.id],
        requiredAnswerIds: [item.id],
        correctionItemIds: [item.id],
      };
    }
    case 'choice': {
      const item = block.targets[itemIndex];
      return {
        id: `${block.id}:item:${item.id}`,
        kind: 'activity',
        block,
        activityIndex,
        activityCount,
        itemIndex,
        itemCount,
        answerItemIds: [item.id],
        requiredAnswerIds: [item.id],
        correctionItemIds: [item.id],
      };
    }
    case 'choice-grid': {
      const row = block.grid.rows[itemIndex];
      const rowIds = block.grid.rows.map((candidate) => candidate.id);
      const finalRow = itemIndex === itemCount - 1;
      return {
        id: `${block.id}:row:${row.id}`,
        kind: 'activity',
        block,
        activityIndex,
        activityCount,
        itemIndex,
        itemCount,
        answerItemIds: [row.id],
        requiredAnswerIds: finalRow ? rowIds : [row.id],
        correctionItemIds: finalRow ? [block.grid.id] : [],
      };
    }
    case 'sentence-ordering': {
      const item = block.interactions[itemIndex];
      return {
        id: `${block.id}:item:${item.id}`,
        kind: 'activity',
        block,
        activityIndex,
        activityCount,
        itemIndex,
        itemCount,
        answerItemIds: [item.id],
        requiredAnswerIds: [item.id],
        correctionItemIds: [item.id],
      };
    }
    case 'matching':
      return {
        id: `${block.id}:item:${block.interaction.id}`,
        kind: 'activity',
        block,
        activityIndex,
        activityCount,
        itemIndex: 0,
        itemCount: 1,
        answerItemIds: [block.interaction.id],
        requiredAnswerIds: [block.interaction.id],
        correctionItemIds: [block.interaction.id],
      };
    case 'free-text':
      return {
        id: `${block.id}:item:${block.interaction.id}`,
        kind: 'activity',
        block,
        activityIndex,
        activityCount,
        itemIndex: 0,
        itemCount: 1,
        answerItemIds: [block.interaction.id],
        requiredAnswerIds: [block.interaction.id],
        correctionItemIds: [block.interaction.id],
      };
  }
}

export function buildLessonSteps(lesson: Lesson): LessonStep[] {
  const blocks = lesson.sections.flatMap((section) => section.blocks);
  const activityCount = blocks.filter((block) => block.kind !== 'context').length;
  let activityIndex = 0;
  const steps: LessonStep[] = [];

  for (const block of blocks) {
    if (block.kind === 'context') {
      const chunks = splitContext(block);
      chunks.forEach((paragraphs, partIndex) => {
        steps.push({
          id: `${block.id}:part:${partIndex + 1}`,
          kind: 'context',
          block,
          paragraphs,
          partIndex,
          partCount: chunks.length,
        });
      });
      continue;
    }

    const currentActivityIndex = activityIndex++;
    for (let itemIndex = 0; itemIndex < activityItemCount(block); itemIndex += 1) {
      steps.push(activityStep(block, currentActivityIndex, activityCount, itemIndex));
    }
  }

  steps.push({
    id: `${lesson.id}:completion`,
    kind: 'completion',
    activityCount,
    interactionCount: lesson.interactionCount,
  });
  return steps;
}

export function stepAnswerComplete(
  step: ActivityLessonStep,
  answers: Record<string, string>,
): boolean {
  if (step.block.kind === 'sentence-ordering') {
    const interaction = step.block.interactions[step.itemIndex];
    return parseOrderedAnswer(answers[interaction.id]).length === interaction.items.length;
  }
  if (step.block.kind === 'matching') {
    const pairs = parseMatchingAnswer(answers[step.block.interaction.id]);
    return Object.keys(pairs).length === step.block.interaction.leftItems.length;
  }
  return step.requiredAnswerIds.every((itemId) => Boolean(answers[itemId]?.trim()));
}
