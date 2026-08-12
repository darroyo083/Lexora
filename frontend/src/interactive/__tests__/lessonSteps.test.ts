import { describe, expect, it } from 'vitest';
import type { Lesson, LessonBlock } from '../lesson';
import { buildLessonSteps, stepAnswerComplete } from '../lessonSteps';

const evidence = { spanIds: [], interactionIds: [], bboxes: [], confidence: 1, detectionMethods: [] };
const box = { x: 0, y: 0, width: 0.2, height: 0.02 };

function lesson(blocks: LessonBlock[]): Lesson {
  return {
    id: 'book:page:4', title: 'Test lesson', unitNumber: null, unitTitle: null,
    source: { bookId: 'book', pageNumber: 4, schemaVersion: '1.4', processorEngine: 'test', processedAt: '' },
    sections: [{ id: 'source', heading: null, blocks }], blockCount: blocks.length, interactionCount: 7,
  };
}

describe('buildLessonSteps', () => {
  it('keeps every numbered source exercise as one complete activity step', () => {
    const source = lesson([{
      id: 'context', kind: 'context', variant: 'theory', sourceY: 0.1, prompt: null, evidence,
      paragraphs: [{ id: 'p1', text: 'Source context.', spanIds: ['s1'] }],
    }, {
      id: 'fill', kind: 'fill-blank', sourceY: 0.2, prompt: 'Complete', evidence,
      exerciseId: 'exercise-10', exerciseNumber: '10', exerciseTitle: 'Verbformen', sourceOrder: 10,
      itemPrompts: { b1: 'One', b2: 'Two' },
      blanks: [
        { id: 'b1', kind: 'fill-in-line', lineBbox: box, interactionBbox: box, detectionMethod: 'horizontal-line-v1', candidateScore: 1, nearbyTextSpanIds: [] },
        { id: 'b2', kind: 'fill-in-line', lineBbox: box, interactionBbox: box, detectionMethod: 'horizontal-line-v1', candidateScore: 1, nearbyTextSpanIds: [] },
      ],
    }, {
      id: 'ordering', kind: 'sentence-ordering', sourceY: 0.3, prompt: null, evidence,
      exerciseId: 'exercise-11', exerciseNumber: '11', sourceOrder: 11,
      interactions: [
        { id: 'o1', kind: 'sentence-ordering', bbox: box, exerciseId: 'exercise-11', promptIndex: 1, detectionMethod: 'sentence-ordering-v1', candidateScore: 1, nearbyTextSpanIds: [], items: [] },
        { id: 'o2', kind: 'sentence-ordering', bbox: box, exerciseId: 'exercise-11', promptIndex: 2, detectionMethod: 'sentence-ordering-v1', candidateScore: 1, nearbyTextSpanIds: [], items: [] },
      ],
    }]);

    const steps = buildLessonSteps(source);
    expect(steps.map((step) => step.id)).toEqual(['exercise-10', 'exercise-11', 'book:page:4:completion']);
    const activities = steps.filter((step) => step.kind === 'activity');
    expect(activities[0]).toMatchObject({ itemCount: 2, answerItemIds: ['b1', 'b2'], correctionItemIds: ['b1', 'b2'] });
    expect(activities[1]).toMatchObject({ itemCount: 2, answerItemIds: ['o1', 'o2'], correctionItemIds: ['o1', 'o2'] });
  });

  it('checks a choice grid once and requires all source rows', () => {
    const grid = {
      id: 'grid', kind: 'choice-grid' as const, sourceY: 0.2, prompt: null, evidence,
      group: { id: 'options', options: [{ id: 'yes', label: 'Yes' }] }, rowPrompts: { r1: 'First', r2: 'Second' },
      grid: { id: 'g1', kind: 'choice-grid' as const, gridBbox: box, optionGroupId: 'options', detectionMethod: 'table-grid-v1' as const, candidateScore: 1,
        rows: [
          { id: 'r1', rowBbox: box, promptBbox: box, nearbyTextSpanIds: [], cells: [] },
          { id: 'r2', rowBbox: box, promptBbox: box, nearbyTextSpanIds: [], cells: [] },
        ] },
    };
    const [step] = buildLessonSteps(lesson([grid])).filter((candidate) => candidate.kind === 'activity');
    expect(step).toMatchObject({ answerItemIds: ['r1', 'r2'], requiredAnswerIds: ['r1', 'r2'], correctionItemIds: ['g1'] });
    expect(stepAnswerComplete(step, { r1: 'yes' })).toBe(false);
    expect(stepAnswerComplete(step, { r1: 'yes', r2: 'yes' })).toBe(true);
  });
});
