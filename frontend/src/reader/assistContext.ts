import type { CorrectionSlot } from '../api/correction';
import type { PageInteractionState } from './overlay';

/**
 * Deterministic-grading precedence helpers for Ask Lexora. "Check with AI" is
 * only offered when Lexora has no source-backed answer, so deterministic
 * grading always stays authoritative.
 */

export function kindOrdinal(kind: string, id: string, interaction: PageInteractionState): number {
  switch (kind) {
    case 'fill-in-line': return interaction.blanks.findIndex((blank) => blank.id === id);
    case 'choice': return interaction.choices.findIndex((choice) => choice.id === id);
    case 'choice-grid': return interaction.grids.findIndex((grid) => grid.id === id);
    case 'sentence-ordering': return interaction.sentenceOrderings.findIndex((ordering) => ordering.id === id);
    case 'matching': return interaction.matchings.findIndex((matching) => matching.id === id);
    case 'free-text': return interaction.freeTexts.findIndex((freeText) => freeText.id === id);
    default: return -1;
  }
}

export function isSourceBacked(
  kind: string,
  ordinal: number,
  slots: CorrectionSlot[],
): boolean {
  if (kind === 'free-text') return false;
  return slots.some((slot) => (
    slot.interactionKind === kind
    && slot.ordinal === ordinal
    && slot.resolution === 'RESOLVED'
  ));
}

export function computeCanCheck(
  kind: string,
  ordinal: number,
  answer: string | null,
  slots: CorrectionSlot[],
): boolean {
  if (ordinal < 0) return false;
  if (!answer || !answer.trim()) return false;
  return !isSourceBacked(kind, ordinal, slots);
}
