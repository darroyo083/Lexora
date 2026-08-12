import { describe, expect, it } from 'vitest';
import type { PageAnalysis } from '../../reader/types';
import { projectLesson } from '../projectLesson';

const box = (x: number, y: number, width = 0.2, height = 0.02) => ({
  x, y, width, height,
});

function analysis(overrides: Partial<PageAnalysis> = {}): PageAnalysis {
  return {
    schemaVersion: '1.4',
    pageNumber: 12,
    width: 1200,
    height: 1600,
    language: 'de',
    semanticExercises: [],
    textSpans: [
      { id: 'title', text: 'Konjunktiv II', confidence: 0.99, confidenceScope: 'line', bbox: box(0.1, 0.04, 0.5) },
      { id: 'instruction', text: 'Ergänzen Sie die Sätze.', confidence: 0.96, confidenceScope: 'line', bbox: box(0.1, 0.15, 0.5) },
      { id: 'blank-prompt', text: 'Wenn ich Zeit hätte?', confidence: 0.93, confidenceScope: 'line', bbox: box(0.1, 0.28, 0.4) },
      { id: 'blank-punctuation', text: '?', confidence: 0.9, confidenceScope: 'line', bbox: box(0.52, 0.28, 0.02) },
      { id: 'choice-prompt', text: 'Wählen Sie die richtige Form', confidence: 0.92, confidenceScope: 'line', bbox: box(0.1, 0.39, 0.5) },
      { id: 'grid-prompt', text: 'Ordnen Sie die Aussagen zu', confidence: 0.91, confidenceScope: 'line', bbox: box(0.1, 0.5, 0.5) },
      { id: 'ordering-prompt', text: 'Bilden Sie einen Satz', confidence: 0.9, confidenceScope: 'line', bbox: box(0.1, 0.61, 0.4) },
      { id: 'matching-prompt', text: 'Verbinden Sie die Paare', confidence: 0.89, confidenceScope: 'line', bbox: box(0.1, 0.72, 0.4) },
      { id: 'free-prompt', text: 'Schreiben Sie Ihre Antwort', confidence: 0.88, confidenceScope: 'line', bbox: box(0.1, 0.84, 0.4) },
    ],
    exerciseBlanks: [
      { id: 'blank-1', kind: 'fill-in-line', lineBbox: box(0.5, 0.3), interactionBbox: box(0.48, 0.29), detectionMethod: 'horizontal-line-v1', candidateScore: 0.9, nearbyTextSpanIds: ['blank-prompt', 'blank-punctuation'] },
      { id: 'blank-2', kind: 'fill-in-line', lineBbox: box(0.5, 0.33), interactionBbox: box(0.48, 0.32), detectionMethod: 'short-suffix-line-v1', candidateScore: 0.8, nearbyTextSpanIds: ['blank-prompt', 'blank-punctuation'] },
    ],
    blankDetection: null,
    choiceGroups: [{ id: 'choice-group', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }],
    choiceTargets: [
      { id: 'choice-1', kind: 'choice', targetBbox: box(0.4, 0.42), interactionBbox: box(0.39, 0.41), optionGroupId: 'choice-group', detectionMethod: 'empty-ring-v1', candidateScore: 0.86, nearbyTextSpanIds: ['choice-prompt'] },
      { id: 'choice-2', kind: 'choice', targetBbox: box(0.5, 0.42), interactionBbox: box(0.49, 0.41), optionGroupId: 'choice-group', detectionMethod: 'empty-ring-v1', candidateScore: 0.84, nearbyTextSpanIds: ['choice-prompt'] },
    ],
    choiceDetection: null,
    choiceGrids: [{
      id: 'grid-1', kind: 'choice-grid', gridBbox: box(0.1, 0.52, 0.7, 0.07), optionGroupId: 'choice-group', detectionMethod: 'table-grid-v1', candidateScore: 0.83,
      rows: [
        { id: 'row-1', rowBbox: box(0.1, 0.53, 0.7), promptBbox: box(0.1, 0.53), nearbyTextSpanIds: ['grid-prompt'], cells: [{ id: 'cell-1a', optionId: 'a', cellBbox: box(0.5, 0.53), interactionBbox: box(0.5, 0.53) }] },
        { id: 'row-2', rowBbox: box(0.1, 0.56, 0.7), promptBbox: box(0.1, 0.56), nearbyTextSpanIds: ['grid-prompt'], cells: [{ id: 'cell-2b', optionId: 'b', cellBbox: box(0.5, 0.56), interactionBbox: box(0.5, 0.56) }] },
      ],
    }],
    choiceGridDetection: null,
    sentenceOrderings: [
      { id: 'ordering-2', kind: 'sentence-ordering', bbox: box(0.1, 0.66), exerciseId: 'ordering-exercise', promptIndex: 2, detectionMethod: 'sentence-ordering-v1', candidateScore: 0.81, nearbyTextSpanIds: ['ordering-prompt'], items: [{ id: 'word-2', text: 'wäre', bbox: box(0.3, 0.66), originalIndex: 2 }] },
      { id: 'ordering-1', kind: 'sentence-ordering', bbox: box(0.1, 0.64), exerciseId: 'ordering-exercise', promptIndex: 1, detectionMethod: 'sentence-ordering-v1', candidateScore: 0.82, nearbyTextSpanIds: ['ordering-prompt'], items: [{ id: 'word-1', text: 'Ich', bbox: box(0.2, 0.64), originalIndex: 1 }] },
    ],
    sentenceOrderingDetection: null,
    matchingInteractions: [{
      id: 'matching-1', kind: 'matching', bbox: box(0.1, 0.74, 0.7, 0.07), detectionMethod: 'matching-v1', candidateScore: 0.79, cardinality: 'one-to-one', nearbyTextSpanIds: ['matching-prompt'],
      leftItems: [{ id: 'left-1', label: '1', text: 'dürfen', bbox: box(0.1, 0.76), anchorBbox: null, nearbyTextSpanIds: [] }],
      rightItems: [{ id: 'right-1', label: 'A', text: 'Erlaubnis', bbox: box(0.5, 0.76), anchorBbox: null, nearbyTextSpanIds: [] }],
    }],
    matchingDetection: null,
    freeTextInteractions: [{ id: 'free-1', kind: 'free-text', bbox: box(0.1, 0.86, 0.7, 0.08), detectionMethod: 'free-text-v1', candidateScore: 0.78, nearbyTextSpanIds: ['free-prompt'], responseLines: [{ id: 'line-1', bbox: box(0.1, 0.9, 0.7) }] }],
    freeTextDetection: null,
    processor: { engine: 'lexora-ai', engineVersion: '2.0', model: 'test', language: 'de', parameters: {}, durationMs: 42, processedAt: '2026-08-10T10:00:00Z' },
    ...overrides,
  };
}

describe('projectLesson', () => {
  it('projects every supported source interaction into ordered lesson blocks', () => {
    const result = projectLesson({
      bookId: 'book-1',
      pageNumber: 12,
      analysis: analysis(),
      unit: { number: 3, title: 'Irreale Bedingungen' },
    });

    expect(result.status).toBe('AVAILABLE');
    if (result.status !== 'AVAILABLE') return;

    const { lesson } = result;
    const blocks = lesson.sections.flatMap((section) => section.blocks);
    expect(lesson).toMatchObject({
      id: 'book-1:page:12',
      title: 'Irreale Bedingungen',
      unitNumber: 3,
      interactionCount: 10,
      source: { bookId: 'book-1', pageNumber: 12, schemaVersion: '1.4', processorEngine: 'lexora-ai' },
    });
    expect(blocks.map((block) => block.kind)).toEqual([
      'fill-blank', 'choice', 'choice-grid',
      'sentence-ordering', 'matching', 'free-text',
    ]);
    expect(blocks[0]).toMatchObject({
      kind: 'fill-blank',
      prompt: 'Wenn ich Zeit hätte?',
      itemPrompts: { 'blank-1': 'Wenn ich Zeit hätte?', 'blank-2': 'Wenn ich Zeit hätte?' },
      evidence: { interactionIds: ['blank-1', 'blank-2'], detectionMethods: ['horizontal-line-v1', 'short-suffix-line-v1'] },
    });
    expect(blocks[1]).toMatchObject({ kind: 'choice', group: { id: 'choice-group' } });
    expect(blocks[3]).toMatchObject({
      kind: 'sentence-ordering',
      interactions: [{ id: 'ordering-1' }, { id: 'ordering-2' }],
    });
  });

  it('keeps projection identities and source evidence deterministic', () => {
    const input = { bookId: 'book-1', pageNumber: 12, analysis: analysis() };
    const first = projectLesson(input);
    const second = projectLesson(input);
    expect(second).toEqual(first);
    if (first.status !== 'AVAILABLE') return;
    expect(first.lesson.sections[0].blocks[0].evidence).toMatchObject({
      spanIds: ['blank-prompt', 'blank-punctuation'],
      interactionIds: ['blank-1', 'blank-2'],
      detectionMethods: ['horizontal-line-v1', 'short-suffix-line-v1'],
    });
  });

  it('coalesces separate option groups that belong to one semantic exercise', () => {
    const source = analysis({
      choiceGroups: [
        { id: 'first-options', options: [{ id: 'yes', label: 'Ja' }, { id: 'no', label: 'Nein' }] },
        { id: 'second-options', options: [{ id: 'cinema', label: 'Kino' }, { id: 'park', label: 'Park' }] },
      ],
      choiceTargets: [
        { id: 'choice-1', kind: 'choice', targetBbox: box(0.4, 0.42), interactionBbox: box(0.39, 0.41), optionGroupId: 'first-options', detectionMethod: 'empty-ring-v1', candidateScore: 0.86, nearbyTextSpanIds: ['choice-prompt'] },
        { id: 'choice-2', kind: 'choice', targetBbox: box(0.5, 0.46), interactionBbox: box(0.49, 0.45), optionGroupId: 'second-options', detectionMethod: 'empty-ring-v1', candidateScore: 0.84, nearbyTextSpanIds: ['choice-prompt'] },
      ],
      semanticExercises: [{
        id: 'exercise-8', number: '8', title: 'Welche Nachricht passt?', instruction: 'Wähle.',
        kind: 'choice', bbox: box(0.1, 0.38, 0.7, 0.12), sourceOrder: 8,
        interactionIds: ['choice-1', 'choice-2'], contextSpanIds: ['choice-prompt'],
        detectionMethod: 'vision-semantic-v1', confidence: 0.95,
      }],
    });

    const result = projectLesson({ bookId: 'book-1', pageNumber: 12, analysis: source });
    if (result.status !== 'AVAILABLE') throw new Error('Expected an available lesson');
    const choices = result.lesson.sections[0].blocks.filter((block) => block.kind === 'choice');
    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({
      exerciseId: 'exercise-8',
      targets: [{ id: 'choice-1' }, { id: 'choice-2' }],
      group: null,
      groupsByTarget: {
        'choice-1': { id: 'first-options' },
        'choice-2': { id: 'second-options' },
      },
    });
  });

  it('falls back to a meaningful source header when no unit title exists', () => {
    const result = projectLesson({ bookId: 'book-1', pageNumber: 12, analysis: analysis() });
    expect(result.status === 'AVAILABLE' ? result.lesson.title : null).toBe('Konjunktiv II');
  });

  it('fails closed for sparse text-only analysis that may contain missed exercises', () => {
    const source = analysis({
      textSpans: [
        { id: 'prompt', text: 'ErgÃ¤nzen Sie.', confidence: 0.97, confidenceScope: 'line', bbox: box(0.1, 0.2) },
      ],
      exerciseBlanks: [], choiceTargets: [], choiceGrids: [], sentenceOrderings: [], matchingInteractions: [], freeTextInteractions: [],
    });
    expect(projectLesson({ bookId: 'book-1', pageNumber: 12, analysis: source })).toEqual({
      status: 'UNAVAILABLE',
      reason: 'NO_MEANINGFUL_CONTENT',
    });
  });

  it('keeps substantial source-backed theory available without exercises', () => {
    const source = analysis({
      textSpans: [
        { id: 'theory-1', text: 'Der Konjunktiv II beschreibt irreale Bedingungen, hÃ¶fliche Bitten und WÃ¼nsche in der deutschen Sprache.', confidence: 0.97, confidenceScope: 'line', bbox: box(0.1, 0.2, 0.8) },
        { id: 'theory-2', text: 'Die Formen werden hÃ¤ufig mit wÃ¼rde und dem Infinitiv gebildet; einige Verben besitzen eigene Formen.', confidence: 0.96, confidenceScope: 'line', bbox: box(0.1, 0.25, 0.8) },
      ],
      exerciseBlanks: [], choiceTargets: [], choiceGrids: [], sentenceOrderings: [], matchingInteractions: [], freeTextInteractions: [],
    });
    expect(projectLesson({ bookId: 'book-1', pageNumber: 12, analysis: source }).status).toBe('AVAILABLE');
  });

  it.each([
    ['missing analysis', null, 12, 'ANALYSIS_UNAVAILABLE'],
    ['wrong source page', analysis(), 99, 'SOURCE_MISMATCH'],
    ['empty source', analysis({ textSpans: [], exerciseBlanks: [], choiceTargets: [], choiceGrids: [], sentenceOrderings: [], matchingInteractions: [], freeTextInteractions: [] }), 12, 'NO_MEANINGFUL_CONTENT'],
  ] as const)('fails closed for %s', (_label, source, pageNumber, reason) => {
    expect(projectLesson({ bookId: 'book-1', pageNumber, analysis: source })).toEqual({
      status: 'UNAVAILABLE',
      reason,
    });
  });
});
