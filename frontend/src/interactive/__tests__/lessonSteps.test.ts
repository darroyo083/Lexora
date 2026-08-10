import { describe, expect, it } from 'vitest';
import type { Lesson, LessonBlock } from '../lesson';
import { buildLessonSteps, stepAnswerComplete } from '../lessonSteps';

const evidence = {
  spanIds: [], interactionIds: [], bboxes: [], confidence: 1, detectionMethods: [],
};
const box = { x: 0, y: 0, width: 0.2, height: 0.02 };

function lesson(blocks: LessonBlock[]): Lesson {
  return {
    id: 'book:page:4',
    title: 'Test lesson',
    unitNumber: null,
    unitTitle: null,
    source: {
      bookId: 'book', pageNumber: 4, schemaVersion: '1.4', processorEngine: 'test', processedAt: '',
    },
    sections: [{ id: 'source', heading: null, blocks }],
    blockCount: blocks.length,
    interactionCount: 7,
  };
}

describe('buildLessonSteps', () => {
  it('splits trusted multi-item blocks into ordered substeps without losing their source block', () => {
    const source = lesson([
      {
        id: 'context', kind: 'context', variant: 'theory', sourceY: 0.1, prompt: null, evidence,
        paragraphs: [
          { id: 'p1', text: 'First source paragraph.', spanIds: ['s1'] },
          { id: 'p2', text: 'Second source paragraph.', spanIds: ['s2'] },
          { id: 'p3', text: 'Third source paragraph.', spanIds: ['s3'] },
        ],
      },
      {
        id: 'fill', kind: 'fill-blank', sourceY: 0.2, prompt: 'Complete', evidence,
        itemPrompts: { b1: 'One', b2: 'Two' },
        blanks: [
          { id: 'b1', kind: 'fill-in-line', lineBbox: box, interactionBbox: box, detectionMethod: 'horizontal-line-v1', candidateScore: 1, nearbyTextSpanIds: [] },
          { id: 'b2', kind: 'fill-in-line', lineBbox: box, interactionBbox: box, detectionMethod: 'horizontal-line-v1', candidateScore: 1, nearbyTextSpanIds: [] },
        ],
      },
      {
        id: 'ordering', kind: 'sentence-ordering', sourceY: 0.3, prompt: null, evidence, exerciseId: 'source-exercise',
        interactions: [
          { id: 'o1', kind: 'sentence-ordering', bbox: box, exerciseId: 'source-exercise', promptIndex: 1, detectionMethod: 'sentence-ordering-v1', candidateScore: 1, nearbyTextSpanIds: [], items: [] },
          { id: 'o2', kind: 'sentence-ordering', bbox: box, exerciseId: 'source-exercise', promptIndex: 2, detectionMethod: 'sentence-ordering-v1', candidateScore: 1, nearbyTextSpanIds: [], items: [] },
        ],
      },
    ]);

    const steps = buildLessonSteps(source);
    expect(steps.map((step) => step.id)).toEqual([
      'context:part:1', 'context:part:2',
      'fill:item:b1', 'fill:item:b2',
      'ordering:item:o1', 'ordering:item:o2',
      'book:page:4:completion',
    ]);
    const activitySteps = steps.filter((step) => step.kind === 'activity');
    expect(activitySteps.map((step) => ({
      block: step.block.id,
      activityIndex: step.activityIndex,
      itemIndex: step.itemIndex,
      itemCount: step.itemCount,
    }))).toEqual([
      { block: 'fill', activityIndex: 0, itemIndex: 0, itemCount: 2 },
      { block: 'fill', activityIndex: 0, itemIndex: 1, itemCount: 2 },
      { block: 'ordering', activityIndex: 1, itemIndex: 0, itemCount: 2 },
      { block: 'ordering', activityIndex: 1, itemIndex: 1, itemCount: 2 },
    ]);
  });

  it('checks a choice grid only on its final row and requires all source rows', () => {
    const grid = {
      id: 'grid', kind: 'choice-grid' as const, sourceY: 0.2, prompt: null, evidence,
      group: { id: 'options', options: [{ id: 'yes', label: 'Yes' }] },
      rowPrompts: { r1: 'First', r2: 'Second' },
      grid: {
        id: 'g1', kind: 'choice-grid' as const, gridBbox: box, optionGroupId: 'options', detectionMethod: 'table-grid-v1' as const, candidateScore: 1,
        rows: [
          { id: 'r1', rowBbox: box, promptBbox: box, nearbyTextSpanIds: [], cells: [] },
          { id: 'r2', rowBbox: box, promptBbox: box, nearbyTextSpanIds: [], cells: [] },
        ],
      },
    };
    const [first, second] = buildLessonSteps(lesson([grid])).filter((step) => step.kind === 'activity');

    expect(first).toMatchObject({ answerItemIds: ['r1'], requiredAnswerIds: ['r1'], correctionItemIds: [] });
    expect(second).toMatchObject({ answerItemIds: ['r2'], requiredAnswerIds: ['r1', 'r2'], correctionItemIds: ['g1'] });
    expect(stepAnswerComplete(second, { r1: 'yes' })).toBe(false);
    expect(stepAnswerComplete(second, { r1: 'yes', r2: 'yes' })).toBe(true);
  });
});
