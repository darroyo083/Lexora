import type { SentenceOrderingInteraction } from './types';
import { bboxPercentageStyle } from './overlay';
import type { PageRotation } from './rotation';
import { parseOrderedAnswer } from './ordering';
import { CorrectionVerdict } from '../state/correction';

interface Props {
  sentenceOrderings: SentenceOrderingInteraction[];
  orderingAnswers: Record<string, string>;
  rotation: PageRotation;
  disabled: boolean;
  activePromptId: string | null;
  verdictByItem: Record<string, CorrectionVerdict | undefined>;
  expectedSequencesByItem: Record<string, string[]>;
  onFragmentClick: (interactionId: string, itemId: string) => void;
}

const GRADED_VERDICTS = new Set<CorrectionVerdict>([
  CorrectionVerdict.CORRECT,
  CorrectionVerdict.INCORRECT,
  CorrectionVerdict.PARTIALLY_CORRECT,
]);

/**
 * In-page fragment hit layer. The printed fragments stay the visual source of
 * truth; each fragment gets a transparent button plus a small position badge
 * once it is used. All answer construction happens in the side panel.
 *
 * After a check with legitimate grading, each used badge is marked
 * correct/incorrect per position against the expected sequence. When no
 * legitimate verdict exists (UNMAPPED / AMBIGUOUS / unresolved), badges stay
 * neutral — no correctness is implied without authoritative grading.
 */
export default function SentenceOrderingOverlay({
  sentenceOrderings,
  orderingAnswers,
  rotation,
  disabled,
  activePromptId,
  verdictByItem,
  expectedSequencesByItem,
  onFragmentClick,
}: Props) {
  return (
    <>
      {sentenceOrderings.flatMap((interaction) => {
        const verdict = verdictByItem[interaction.id];
        const graded = verdict !== undefined && GRADED_VERDICTS.has(verdict);
        const expected = graded ? (expectedSequencesByItem[interaction.id] ?? []) : [];
        return interaction.items.map((item) => {
          const ordered = parseOrderedAnswer(orderingAnswers[interaction.id]);
          const position = ordered.indexOf(item.id) + 1;
          const isUsed = position > 0;
          const complete = ordered.length === interaction.items.length;
          const positionCorrect = graded && expected.length >= position
            && expected[position - 1] === item.id;
          const badgeClass = [
            'ordering-fragment-badge',
            graded ? 'ordering-badge' : '',
            graded && positionCorrect ? 'correct' : '',
            graded && !positionCorrect ? 'incorrect' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={item.id}
              type="button"
              className={[
                'ordering-fragment',
                isUsed ? 'ordering-fragment-used' : '',
                complete ? 'ordering-fragment-complete' : '',
                interaction.id === activePromptId ? 'ordering-fragment-active' : '',
              ].filter(Boolean).join(' ')}
              aria-label={`${item.text}${isUsed ? ` — position ${position} in the sentence` : ''}${graded && isUsed
                ? (positionCorrect ? ', correct position' : ', incorrect position')
                : ''}`}
              aria-pressed={isUsed}
              style={bboxPercentageStyle(item.bbox, rotation)}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onFragmentClick(interaction.id, item.id);
              }}
            >
              {isUsed && (
                <span className={badgeClass} aria-hidden="true">
                  {position}
                </span>
              )}
            </button>
          );
        });
      })}
    </>
  );
}
