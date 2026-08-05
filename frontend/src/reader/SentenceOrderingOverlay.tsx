import type { SentenceOrderingInteraction } from './types';
import { bboxPercentageStyle } from './overlay';
import type { PageRotation } from './rotation';
import { parseOrderedAnswer } from './ordering';

interface Props {
  sentenceOrderings: SentenceOrderingInteraction[];
  orderingAnswers: Record<string, string>;
  rotation: PageRotation;
  disabled: boolean;
  activePromptId: string | null;
  onFragmentClick: (interactionId: string, itemId: string) => void;
}

/**
 * In-page fragment hit layer. The printed fragments stay the visual source of
 * truth; each fragment gets a transparent button plus a small position badge
 * once it is used. All answer construction happens in the side panel.
 */
export default function SentenceOrderingOverlay({
  sentenceOrderings,
  orderingAnswers,
  rotation,
  disabled,
  activePromptId,
  onFragmentClick,
}: Props) {
  return (
    <>
      {sentenceOrderings.flatMap((interaction) => interaction.items.map((item) => {
        const ordered = parseOrderedAnswer(orderingAnswers[interaction.id]);
        const position = ordered.indexOf(item.id) + 1;
        const isUsed = position > 0;
        const complete = ordered.length === interaction.items.length;
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
            aria-label={`${item.text}${isUsed ? ` — position ${position} in the sentence` : ''}`}
            aria-pressed={isUsed}
            style={bboxPercentageStyle(item.bbox, rotation)}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onFragmentClick(interaction.id, item.id);
            }}
          >
            {isUsed && (
              <span className="ordering-fragment-badge" aria-hidden="true">
                {position}
              </span>
            )}
          </button>
        );
      }))}
    </>
  );
}
