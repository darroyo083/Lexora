import type { BBox, MatchingInteraction } from './types';

/**
 * Pure state transitions for matching answers.
 *
 * The authoritative answer maps left item IDs to right item IDs
 * (`leftItemId -> rightItemId`). One-to-one is enforced structurally:
 * creating a pair frees both items from any previous pair, so a right item
 * can never be connected twice and a left item keeps at most one connection.
 */

export type MatchingPairs = Record<string, string>;

export function parseMatchingAnswer(value: string | undefined | null): MatchingPairs {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const pairs: MatchingPairs = {};
    for (const [leftId, rightId] of Object.entries(parsed)) {
      if (typeof rightId === 'string' && rightId) pairs[leftId] = rightId;
    }
    return pairs;
  } catch {
    return {};
  }
}

export function serializeMatchingAnswer(pairs: MatchingPairs): string {
  return JSON.stringify(pairs);
}

/** Create or replace the pair, enforcing one-to-one on both sides. */
export function matchItems(
  pairs: MatchingPairs,
  leftId: string,
  rightId: string,
): MatchingPairs {
  const next = { ...pairs };
  for (const [existingLeft, existingRight] of Object.entries(next)) {
    if (existingLeft === leftId || existingRight === rightId) {
      delete next[existingLeft];
    }
  }
  next[leftId] = rightId;
  return next;
}

/** Remove every pair that touches the item (left or right side). */
export function unmatchItem(pairs: MatchingPairs, itemId: string): MatchingPairs {
  const next: MatchingPairs = {};
  for (const [leftId, rightId] of Object.entries(pairs)) {
    if (leftId === itemId || rightId === itemId) continue;
    next[leftId] = rightId;
  }
  return next;
}

export function resetExercise(): MatchingPairs {
  return {};
}

export function rightItemIdOf(
  pairs: MatchingPairs,
  leftId: string,
): string | null {
  return pairs[leftId] ?? null;
}

export function leftItemIdOf(
  pairs: MatchingPairs,
  rightId: string,
): string | null {
  for (const [leftId, matchedRight] of Object.entries(pairs)) {
    if (matchedRight === rightId) return leftId;
  }
  return null;
}

export function isItemMatched(pairs: MatchingPairs, itemId: string): boolean {
  return itemId in pairs || Object.values(pairs).includes(itemId);
}

export function matchedPairsForExercise(
  pairs: MatchingPairs,
  interaction: MatchingInteraction,
): Array<{ left: MatchingItemLike; right: MatchingItemLike }> {
  const leftById = new Map(interaction.leftItems.map((item) => [item.id, item]));
  const rightById = new Map(interaction.rightItems.map((item) => [item.id, item]));
  const matched: Array<{ left: MatchingItemLike; right: MatchingItemLike }> = [];
  for (const [leftId, rightId] of Object.entries(pairs)) {
    const left = leftById.get(leftId);
    const right = rightById.get(rightId);
    if (left && right) matched.push({ left, right });
  }
  return matched;
}

export type MatchingItemLike = {
  id: string;
  bbox: BBox;
  anchorBbox: BBox | null;
};

export interface MatchingSelection {
  interactionId: string;
  itemId: string;
  side: 'left' | 'right';
}

export type MatchingSelectionAction =
  | { type: 'select-left'; interactionId: string; itemId: string }
  | { type: 'select-right'; interactionId: string; itemId: string }
  | { type: 'clear' };

/**
 * Selection state machine for pairing on the page.
 *
 * Selecting the already-active item clears the selection; selecting an item
 * of the opposite side in the same exercise creates the pair through
 * `matchItems` in the caller, which then dispatches `clear`. Pair creation
 * itself is not a selection transition.
 */
export function matchingSelectionReducer(
  state: MatchingSelection | null,
  action: MatchingSelectionAction,
): MatchingSelection | null {
  switch (action.type) {
    case 'clear':
      return null;
    case 'select-left': {
      if (state && state.itemId === action.itemId && state.side === 'left') {
        return null;
      }
      return { interactionId: action.interactionId, itemId: action.itemId, side: 'left' };
    }
    case 'select-right': {
      if (state && state.itemId === action.itemId && state.side === 'right') {
        return null;
      }
      return { interactionId: action.interactionId, itemId: action.itemId, side: 'right' };
    }
  }
}
