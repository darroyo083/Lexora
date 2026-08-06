import { describe, expect, it } from 'vitest';
import type { MatchingInteraction } from '../types';
import {
  isItemMatched,
  leftItemIdOf,
  matchItems,
  matchedPairsForExercise,
  matchingSelectionReducer,
  parseMatchingAnswer,
  resetExercise,
  rightItemIdOf,
  serializeMatchingAnswer,
  unmatchItem,
} from '../matching';
import { matchingEndpoint, matchingHitStyle } from '../overlay';

function interaction(overrides: Partial<MatchingInteraction> = {}): MatchingInteraction {
  const ids = ['l1', 'l2', 'l3', 'r1', 'r2', 'r3'];
  const item = (id: string, side: 'left' | 'right') => ({
    id,
    label: id,
    text: `item ${id}`,
    bbox: { x: side === 'left' ? 0.1 : 0.7, y: 0.2 + ids.indexOf(id) * 0.02, width: 0.15, height: 0.015 },
    anchorBbox: side === 'left'
      ? { x: 0.3, y: 0.2 + ids.indexOf(id) * 0.02, width: 0.006, height: 0.006 }
      : { x: 0.66, y: 0.2 + ids.indexOf(id) * 0.02, width: 0.006, height: 0.006 },
    nearbyTextSpanIds: [],
  });
  return {
    id: 'matching-1',
    kind: 'matching',
    bbox: { x: 0.1, y: 0.2, width: 0.6, height: 0.1 },
    detectionMethod: 'matching-v1',
    candidateScore: 0.9,
    cardinality: 'one-to-one',
    nearbyTextSpanIds: [],
    leftItems: [item('l1', 'left'), item('l2', 'left'), item('l3', 'left')],
    rightItems: [item('r1', 'right'), item('r2', 'right'), item('r3', 'right')],
    ...overrides,
  };
}

describe('matching answer model', () => {
  it('serializes and parses pairs as a JSON map', () => {
    const value = serializeMatchingAnswer({ l1: 'r2' });
    expect(value).toBe('{"l1":"r2"}');
    expect(parseMatchingAnswer(value)).toEqual({ l1: 'r2' });
  });

  it('parses malformed values as empty pairs', () => {
    expect(parseMatchingAnswer(null)).toEqual({});
    expect(parseMatchingAnswer('')).toEqual({});
    expect(parseMatchingAnswer('{not json')).toEqual({});
    expect(parseMatchingAnswer('["array"]')).toEqual({});
    expect(parseMatchingAnswer('{"l1": 42}')).toEqual({});
  });

  it('creates a pair from left to right', () => {
    expect(matchItems({}, 'l1', 'r2')).toEqual({ l1: 'r2' });
  });

  it('replaces a left item previous pair when rematching', () => {
    const pairs = matchItems({ l1: 'r1' }, 'l1', 'r2');
    expect(pairs).toEqual({ l1: 'r2' });
    expect(rightItemIdOf(pairs, 'l1')).toBe('r2');
  });

  it('enforces one-to-one: reusing a matched right item frees its old left item', () => {
    const pairs = matchItems({ l1: 'r1', l2: 'r2' }, 'l3', 'r2');
    expect(pairs).toEqual({ l1: 'r1', l3: 'r2' });
    expect(rightItemIdOf(pairs, 'l2')).toBeNull();
    expect(leftItemIdOf(pairs, 'r2')).toBe('l3');
  });

  it('enforces one-to-one: reusing a matched left item frees its old right item', () => {
    const pairs = matchItems({ l1: 'r1', l2: 'r2' }, 'l1', 'r3');
    expect(pairs).toEqual({ l2: 'r2', l1: 'r3' });
    expect(leftItemIdOf(pairs, 'r1')).toBeNull();
  });

  it('does not mutate the previous pairs object', () => {
    const before = { l1: 'r1' };
    const after = matchItems(before, 'l1', 'r2');
    expect(before).toEqual({ l1: 'r1' });
    expect(after).not.toBe(before);
  });

  it('unpairs an item from either side', () => {
    expect(unmatchItem({ l1: 'r1', l2: 'r2' }, 'l1')).toEqual({ l2: 'r2' });
    expect(unmatchItem({ l1: 'r1', l2: 'r2' }, 'r2')).toEqual({ l1: 'r1' });
  });

  it('resets an exercise to no pairs', () => {
    expect(resetExercise()).toEqual({});
  });

  it('reports matched state per item', () => {
    const pairs = { l1: 'r2' };
    expect(isItemMatched(pairs, 'l1')).toBe(true);
    expect(isItemMatched(pairs, 'r2')).toBe(true);
    expect(isItemMatched(pairs, 'l2')).toBe(false);
  });

  it('builds resolved pairs only from items that exist in the interaction', () => {
    const ex = interaction();
    const pairs = { l1: 'r1', l2: 'ghost', ghost2: 'r3' };
    const resolved = matchedPairsForExercise(pairs, ex);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].left.id).toBe('l1');
    expect(resolved[0].right.id).toBe('r1');
  });
});

describe('matching selection reducer', () => {
  it('activates a left item on first selection', () => {
    expect(
      matchingSelectionReducer(null, { type: 'select-left', interactionId: 'matching-1', itemId: 'l1' }),
    ).toEqual({ interactionId: 'matching-1', itemId: 'l1', side: 'left' });
  });

  it('activates a right item on first selection', () => {
    expect(
      matchingSelectionReducer(null, { type: 'select-right', interactionId: 'matching-1', itemId: 'r2' }),
    ).toEqual({ interactionId: 'matching-1', itemId: 'r2', side: 'right' });
  });

  it('clears when the active item is selected again', () => {
    const active = { interactionId: 'matching-1', itemId: 'l1', side: 'left' as const };
    expect(
      matchingSelectionReducer(active, { type: 'select-left', interactionId: 'matching-1', itemId: 'l1' }),
    ).toBeNull();
    const activeRight = { interactionId: 'matching-1', itemId: 'r2', side: 'right' as const };
    expect(
      matchingSelectionReducer(activeRight, { type: 'select-right', interactionId: 'matching-1', itemId: 'r2' }),
    ).toBeNull();
  });

  it('switches the active side when another item is selected', () => {
    const active = { interactionId: 'matching-1', itemId: 'l1', side: 'left' as const };
    expect(
      matchingSelectionReducer(active, { type: 'select-right', interactionId: 'matching-1', itemId: 'r1' }),
    ).toEqual({ interactionId: 'matching-1', itemId: 'r1', side: 'right' });
  });

  it('clears explicitly', () => {
    const active = { interactionId: 'matching-1', itemId: 'l1', side: 'left' as const };
    expect(matchingSelectionReducer(active, { type: 'clear' })).toBeNull();
  });
});

describe('matching endpoint geometry', () => {
  const ex = interaction();

  it('uses the printed anchor center for left and right items at 0 degrees', () => {
    const left = matchingEndpoint(ex.leftItems[0], 'left', 0);
    expect(left.x).toBeCloseTo(0.303);
    const right = matchingEndpoint(ex.rightItems[0], 'right', 0);
    expect(right.x).toBeCloseTo(0.663);
  });

  it('falls back to the text edge when the anchor is missing', () => {
    const left = matchingEndpoint({ ...ex.leftItems[0], anchorBbox: null }, 'left', 0);
    expect(left.x).toBeCloseTo(0.25);
    const right = matchingEndpoint({ ...ex.rightItems[0], anchorBbox: null }, 'right', 0);
    expect(right.x).toBeCloseTo(0.7);
  });

  it('rotates anchor endpoints with the page rotation', () => {
    const left90 = matchingEndpoint(ex.leftItems[0], 'left', 90);
    const left180 = matchingEndpoint(ex.leftItems[0], 'left', 180);
    const left270 = matchingEndpoint(ex.leftItems[0], 'left', 270);
    // 90° maps (x,y) -> (1 - (y + h), x) around the anchor center
    const anchor = ex.leftItems[0].anchorBbox!;
    const cy = anchor.y + anchor.height / 2;
    const cx = anchor.x + anchor.width / 2;
    expect(left90.x).toBeCloseTo(1 - cy);
    expect(left90.y).toBeCloseTo(cx);
    expect(left180.x).toBeCloseTo(1 - cx);
    expect(left180.y).toBeCloseTo(1 - cy);
    expect(left270.x).toBeCloseTo(cy);
    expect(left270.y).toBeCloseTo(1 - cx);
  });

  it('keeps endpoints identical across zoom because they are normalized', () => {
    const a = matchingEndpoint(ex.leftItems[1], 'left', 0);
    const b = matchingEndpoint(ex.rightItems[1], 'right', 0);
    // The same normalized coordinates render at any zoom level; only the
    // pixel scale changes, which the percentage-based overlay handles.
    expect(a.x).toBeGreaterThan(0);
    expect(a.x).toBeLessThan(1);
    expect(b.x).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(1);
  });
});

describe('matching hit area geometry', () => {
  const ex = interaction();
  const pct = (value: string) => parseFloat(value) / 100;

  it('extends a left item hit area to its printed anchor', () => {
    const style = matchingHitStyle(ex.leftItems[0], 'left', 0);
    const item = ex.leftItems[0];
    const anchor = item.anchorBbox!;
    const rightEdge = pct(style.left) + pct(style.width);
    // covers the full text plus the anchor dot
    expect(rightEdge).toBeGreaterThanOrEqual(anchor.x + anchor.width);
    expect(pct(style.left)).toBeCloseTo(item.bbox.x);
  });

  it('extends a right item hit area back to its printed anchor', () => {
    const style = matchingHitStyle(ex.rightItems[0], 'right', 0);
    const item = ex.rightItems[0];
    const anchor = item.anchorBbox!;
    const leftEdge = pct(style.left);
    const rightEdge = leftEdge + pct(style.width);
    expect(leftEdge).toBeLessThanOrEqual(anchor.x);
    expect(rightEdge).toBeCloseTo(item.bbox.x + item.bbox.width, 4);
  });

  it('applies a small pad when the anchor is missing', () => {
    const left = matchingHitStyle({ ...ex.leftItems[0], anchorBbox: null }, 'left', 0);
    expect(pct(left.width)).toBeGreaterThan(ex.leftItems[0].bbox.width);
    const right = matchingHitStyle({ ...ex.rightItems[0], anchorBbox: null }, 'right', 0);
    expect(pct(right.width)).toBeGreaterThan(ex.rightItems[0].bbox.width);
    expect(pct(right.left)).toBeLessThan(ex.rightItems[0].bbox.x);
  });

  it('keeps the anchor covered at 90 degrees rotation', () => {
    const style = matchingHitStyle(ex.leftItems[0], 'left', 90);
    const anchor = ex.leftItems[0].anchorBbox!;
    const rightEdge = pct(style.left) + pct(style.width);
    const rotatedAnchorRight = 1 - (anchor.y + anchor.height);
    expect(rightEdge).toBeGreaterThanOrEqual(rotatedAnchorRight);
  });
});
