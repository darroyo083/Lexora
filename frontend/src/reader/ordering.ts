import type { SentenceOrderingInteraction, SentenceOrderingItem } from './types';

/**
 * Pure state transitions for sentence-ordering answers.
 *
 * The authoritative answer is an ordered list of item IDs. Text is never used
 * as identity, so duplicate fragment texts keep distinct positions.
 */

export const ORDERED_ITEM_SEPARATOR = ',';

export function parseOrderedAnswer(value: string | undefined | null): string[] {
  if (!value) return [];
  return value.split(ORDERED_ITEM_SEPARATOR).filter(Boolean);
}

export function serializeOrderedAnswer(ordered: string[]): string {
  return ordered.join(ORDERED_ITEM_SEPARATOR);
}

/** Append the item at the end, or remove it if it is already ordered. */
export function toggleItem(ordered: string[], itemId: string): string[] {
  if (ordered.includes(itemId)) {
    return ordered.filter((id) => id !== itemId);
  }
  return [...ordered, itemId];
}

export function removeItem(ordered: string[], itemId: string): string[] {
  return ordered.filter((id) => id !== itemId);
}

export function moveItem(
  ordered: string[],
  index: number,
  direction: -1 | 1,
): string[] {
  const target = index + direction;
  if (index < 0 || index >= ordered.length) return ordered;
  if (target < 0 || target >= ordered.length) return ordered;
  const next = [...ordered];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

export function isOrderComplete(
  ordered: string[],
  interaction: SentenceOrderingInteraction,
): boolean {
  return ordered.length === interaction.items.length;
}

export function orderPosition(
  ordered: string[],
  itemId: string,
): number | null {
  const index = ordered.indexOf(itemId);
  return index === -1 ? null : index + 1;
}

export function orderedItems(
  ordered: string[],
  interaction: SentenceOrderingInteraction,
): SentenceOrderingItem[] {
  const byId = new Map(interaction.items.map((item) => [item.id, item]));
  return ordered
    .map((id) => byId.get(id))
    .filter((item): item is SentenceOrderingItem => item != null);
}

export function unusedItems(
  ordered: string[],
  interaction: SentenceOrderingInteraction,
): SentenceOrderingItem[] {
  const used = new Set(ordered);
  return interaction.items.filter((item) => !used.has(item.id));
}

const JOINED_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);

/**
 * Render the constructed sentence for display: fragments joined with spaces,
 * punctuation-only fragments attached to the preceding piece. Punctuation is
 * an ordinary orderable item — it renders wherever the learner placed it and
 * is never appended automatically.
 */
export function joinedSentence(items: SentenceOrderingItem[]): string {
  return items.reduce((sentence, item, index) => {
    const piece = item.text.trim();
    if (index === 0) return piece;
    if (JOINED_PUNCTUATION.has(piece)) return `${sentence}${piece}`;
    return `${sentence} ${piece}`;
  }, '');
}

/** Union bbox of an exercise's interactions in normalized coordinates. */
export function exerciseBBox(
  interactions: SentenceOrderingInteraction[],
): { x: number; y: number; width: number; height: number } {
  if (interactions.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const left = Math.min(...interactions.map((i) => i.bbox.x));
  const top = Math.min(...interactions.map((i) => i.bbox.y));
  const right = Math.max(...interactions.map((i) => i.bbox.x + i.bbox.width));
  const bottom = Math.max(...interactions.map((i) => i.bbox.y + i.bbox.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
