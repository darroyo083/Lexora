import { describe, expect, it } from 'vitest';
import {
  exerciseBBox,
  isOrderComplete,
  joinedSentence,
  moveItem,
  orderPosition,
  orderedItems,
  parseOrderedAnswer,
  serializeOrderedAnswer,
  toggleItem,
  unusedItems,
} from '../ordering';
import type { SentenceOrderingInteraction } from '../types';

function interaction(
  id: string,
  texts: string[],
): SentenceOrderingInteraction {
  return {
    id,
    kind: 'sentence-ordering',
    bbox: { x: 0.15, y: 0.2, width: 0.5, height: 0.02 },
    exerciseId: 'sentence-order-exercise-1',
    promptIndex: 1,
    detectionMethod: 'sentence-ordering-v1',
    candidateScore: 0.9,
    nearbyTextSpanIds: [],
    items: texts.map((text, index) => ({
      id: `${id}-item-${index + 1}`,
      text,
      bbox: { x: 0.15 + index * 0.1, y: 0.2, width: 0.08, height: 0.02 },
      originalIndex: index + 1,
    })),
  };
}

describe('parse/serialize', () => {
  it('round-trips ordered item ids', () => {
    const ordered = ['a-item-2', 'a-item-1', 'a-item-3'];
    expect(parseOrderedAnswer(serializeOrderedAnswer(ordered))).toEqual(ordered);
  });

  it('treats empty and undefined values as empty order', () => {
    expect(parseOrderedAnswer(undefined)).toEqual([]);
    expect(parseOrderedAnswer('')).toEqual([]);
    expect(parseOrderedAnswer('a,b,,c')).toEqual(['a', 'b', 'c']);
  });
});

describe('toggleItem', () => {
  it('appends an unused item', () => {
    expect(toggleItem(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('removes an already ordered item', () => {
    expect(toggleItem(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('supports duplicate texts via distinct ids', () => {
    const ordered = toggleItem([], 'x-item-1');
    expect(toggleItem(ordered, 'x-item-3')).toEqual(['x-item-1', 'x-item-3']);
    expect(toggleItem(['x-item-1', 'x-item-3'], 'x-item-1'))
      .toEqual(['x-item-3']);
  });
});

describe('moveItem', () => {
  it('moves an item left', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('moves an item right', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('ignores out-of-range moves', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 1)).toEqual(['a', 'b']);
  });
});

describe('order helpers', () => {
  const ex = interaction('inter', ['Er', 'kommt', 'heute', '.']);

  it('reports 1-based positions', () => {
    expect(orderPosition(['inter-item-2', 'inter-item-1'], 'inter-item-2')).toBe(1);
    expect(orderPosition(['inter-item-2'], 'inter-item-3')).toBeNull();
  });

  it('detects complete orders by count, not text', () => {
    expect(isOrderComplete(['inter-item-1', 'inter-item-2', 'inter-item-3', 'inter-item-4'], ex)).toBe(true);
    expect(isOrderComplete(['inter-item-1'], ex)).toBe(false);
  });

  it('maps ordered ids to items and keeps order', () => {
    const ordered = orderedItems(['inter-item-4', 'inter-item-1'], ex);
    expect(ordered.map((i) => i.text)).toEqual(['.', 'Er']);
  });

  it('lists unused items for partial orders', () => {
    const unused = unusedItems(['inter-item-1'], ex);
    expect(unused.map((i) => i.text)).toEqual(['kommt', 'heute', '.']);
  });

  it('counts punctuation as an orderable item like any other', () => {
    expect(isOrderComplete(['inter-item-1', 'inter-item-2', 'inter-item-3'], ex)).toBe(false);
    expect(isOrderComplete(['inter-item-1', 'inter-item-2', 'inter-item-3', 'inter-item-4'], ex)).toBe(true);
    expect(unusedItems(['inter-item-4'], ex).map((i) => i.text)).toEqual(['Er', 'kommt', 'heute']);
  });
});

describe('joinedSentence', () => {
  const ex = interaction('inter', ['Am Sonntag', 'wir', 'lange', 'schlafen', '.']);

  it('joins fragments with spaces and attaches trailing punctuation items', () => {
    const items = orderedItems(
      ['inter-item-1', 'inter-item-3', 'inter-item-4', 'inter-item-2', 'inter-item-5'],
      ex,
    );
    expect(joinedSentence(items)).toBe('Am Sonntag lange schlafen wir.');
  });

  it('renders punctuation wherever the learner placed it', () => {
    const middle = orderedItems(['inter-item-1', 'inter-item-5', 'inter-item-2'], ex);
    expect(joinedSentence(middle)).toBe('Am Sonntag. wir');

    const first = orderedItems(['inter-item-5', 'inter-item-1'], ex);
    expect(joinedSentence(first)).toBe('. Am Sonntag');
  });

  it('never appends punctuation automatically', () => {
    const withoutMark = orderedItems(['inter-item-1', 'inter-item-2', 'inter-item-3', 'inter-item-4'], ex);
    expect(joinedSentence(withoutMark)).toBe('Am Sonntag wir lange schlafen');
  });

  it('returns empty string for empty order', () => {
    expect(joinedSentence([])).toBe('');
  });
});

describe('exerciseBBox', () => {
  it('unions interaction bboxes', () => {
    const a = {
      ...interaction('a', ['x', 'y']),
      bbox: { x: 0.25, y: 0.25, width: 0.5, height: 0.125 },
    };
    const b = {
      ...interaction('b', ['p']),
      bbox: { x: 0.5, y: 0.625, width: 0.25, height: 0.0625 },
    };
    const box = exerciseBBox([a, b]);
    expect(box).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.4375 });
  });

  it('returns zero box for no interactions', () => {
    expect(exerciseBBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
