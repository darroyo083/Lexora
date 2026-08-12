import type { ContextLessonBlock, Lesson, LessonBlock } from './lesson';
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

function answerIds(block: ActivityBlock): string[] {
  switch (block.kind) {
    case 'fill-blank': return block.blanks.map((blank) => blank.id);
    case 'choice': return block.targets.map((target) => target.id);
    case 'choice-grid': return block.grid.rows.map((row) => row.id);
    case 'sentence-ordering': return block.interactions.map((interaction) => interaction.id);
    case 'matching': return [block.interaction.id];
    case 'free-text': return [block.interaction.id];
  }
}

function correctionIds(block: ActivityBlock): string[] {
  return block.kind === 'choice-grid' ? [block.grid.id] : answerIds(block);
}

function itemCount(block: ActivityBlock): number {
  switch (block.kind) {
    case 'fill-blank': return block.blanks.length;
    case 'choice': return block.targets.length;
    case 'choice-grid': return block.grid.rows.length;
    case 'sentence-ordering': return block.interactions.length;
    case 'matching': return block.interaction.leftItems.length;
    case 'free-text': return 1;
  }
}

export function buildLessonSteps(lesson: Lesson): LessonStep[] {
  const blocks = lesson.sections.flatMap((section) => section.blocks);
  const activities = blocks.filter((block): block is ActivityBlock => block.kind !== 'context');
  const steps: LessonStep[] = [];

  if (activities.length === 0) {
    for (const block of blocks) {
      if (block.kind !== 'context') continue;
      steps.push({
        id: block.id,
        kind: 'context',
        block,
        paragraphs: block.paragraphs,
        partIndex: 0,
        partCount: 1,
      });
    }
  }

  activities.forEach((block, activityIndex) => {
    const ids = answerIds(block);
    steps.push({
      id: block.exerciseId || block.id,
      kind: 'activity',
      block,
      activityIndex,
      activityCount: activities.length,
      itemIndex: 0,
      itemCount: itemCount(block),
      answerItemIds: ids,
      requiredAnswerIds: ids,
      correctionItemIds: correctionIds(block),
    });
  });

  steps.push({
    id: `${lesson.id}:completion`,
    kind: 'completion',
    activityCount: activities.length,
    interactionCount: lesson.interactionCount,
  });
  return steps;
}

export function stepAnswerComplete(step: ActivityLessonStep, answers: Record<string, string>): boolean {
  if (step.block.kind === 'sentence-ordering') {
    return step.block.interactions.every((interaction) => (
      parseOrderedAnswer(answers[interaction.id]).length === interaction.items.length
    ));
  }
  if (step.block.kind === 'matching') {
    const pairs = parseMatchingAnswer(answers[step.block.interaction.id]);
    return Object.keys(pairs).length === step.block.interaction.leftItems.length;
  }
  return step.requiredAnswerIds.every((itemId) => Boolean(answers[itemId]?.trim()));
}
