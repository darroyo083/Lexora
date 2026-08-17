import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ChoiceLessonBlock, Lesson, LessonBlock } from '../lesson';
import type { PageAnalysis } from '../../reader/types';
import { projectLesson } from '../projectLesson';
import { publicDemoProjectionFixture } from './publicDemoProjection.fixture';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));

function loadPageAnalysis(pageNumber: number): PageAnalysis {
  const path = resolve(
    fixtureDirectory,
    `../../../../backend/src/main/resources/demo/page-analysis-${pageNumber}.json`,
  );
  return JSON.parse(readFileSync(path, 'utf8')) as PageAnalysis;
}

function blockFor(lesson: Lesson, number: string): LessonBlock {
  const block = lesson.sections.flatMap((section) => section.blocks)
    .find((candidate) => candidate.exerciseNumber === number);
  if (!block) throw new Error(`Missing projected exercise ${number}`);
  return block;
}

function optionLabels(block: ChoiceLessonBlock, targetId: string): string[] {
  const group = block.groupsByTarget?.[targetId] ?? block.group;
  return group?.options.map((option) => option.label) ?? [];
}

describe('public-demo Classic to Interactive projection', () => {
  it.each(publicDemoProjectionFixture)('keeps exercise $number on page $pageNumber source-faithful', (expected) => {
    const result = projectLesson({
      bookId: 'public-demo',
      pageNumber: expected.pageNumber,
      analysis: loadPageAnalysis(expected.pageNumber),
    });
    expect(result.status).toBe('AVAILABLE');
    if (result.status !== 'AVAILABLE') return;

    const block = blockFor(result.lesson, expected.number);
    expect(block).toMatchObject({
      kind: expected.kind,
      exerciseTitle: expected.title,
    });

    if (expected.kind === 'fill-blank') {
      expect(block.kind).toBe('fill-blank');
      if (block.kind !== 'fill-blank') return;
      expect(block.itemLabels && block.blanks.map((blank) => block.itemLabels?.[blank.id] ?? null))
        .toEqual(expected.itemLabels);
      expect(block.blanks.map((blank) => block.itemPrompts[blank.id])).toEqual(expected.itemPrompts);
    }

    if (expected.kind === 'choice') {
      expect(block.kind).toBe('choice');
      if (block.kind !== 'choice') return;
      expect(block.targets.map((target) => block.itemPrompts[target.id])).toEqual(expected.prompts);
      expect(block.targets.map((target) => optionLabels(block, target.id))).toEqual(expected.options);
      const optionTexts = new Set(expected.options.flat());
      const contextTexts = (block.contextParagraphs ?? []).map((paragraph) => paragraph.text);
      expect(contextTexts.some((text) => optionTexts.has(text))).toBe(false);
      if ('context' in expected) expect(contextTexts).toEqual(expected.context);
    }

    if (expected.kind === 'choice-grid') {
      expect(block.kind).toBe('choice-grid');
      if (block.kind !== 'choice-grid') return;
      expect(block.grid.rows.map((row) => block.rowPrompts[row.id])).toEqual(expected.rowPrompts);
    }

    if (expected.kind === 'matching') {
      expect(block.kind).toBe('matching');
      if (block.kind !== 'matching') return;
      expect(block.interaction.leftItems.map((item) => item.text)).toEqual(expected.leftItems);
      expect(block.interaction.rightItems.map((item) => item.text)).toEqual(expected.rightItems);
    }

    if (expected.kind === 'sentence-ordering') {
      expect(block.kind).toBe('sentence-ordering');
      if (block.kind !== 'sentence-ordering') return;
      expect(block.interactions.map((interaction) => interaction.items.map((item) => item.text)))
        .toEqual(expected.orderingItems);
    }

    if (expected.kind === 'free-text') {
      expect(block.kind).toBe('free-text');
      if (block.kind !== 'free-text') return;
      expect(block.prompt).toBe(expected.prompt);
    }
  });
});
