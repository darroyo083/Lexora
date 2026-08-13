import type { SentenceOrderingInteraction } from './types';
import { joinedSentence, moveItem, orderedItems, removeItem, unusedItems } from './ordering';
import { CorrectionVerdict } from '../state/correction';

interface Props {
  active: SentenceOrderingInteraction;
  siblings: SentenceOrderingInteraction[];
  promptIndex: number;
  ordered: string[];
  disabled: boolean;
  verdict?: CorrectionVerdict | undefined;
  expected?: string[];
  onPromptChange: (interactionId: string) => void;
  onOrderingChange: (interactionId: string, ordered: string[]) => void;
}

const ARROW_LEFT = 'ArrowLeft';
const ARROW_RIGHT = 'ArrowRight';

const GRADED_VERDICTS = new Set<CorrectionVerdict>([
  CorrectionVerdict.CORRECT,
  CorrectionVerdict.INCORRECT,
  CorrectionVerdict.PARTIALLY_CORRECT,
]);

/**
 * The shared sentence-ordering answer controls: previous/next prompt
 * navigation, numbered chips with move/remove keyboard support, progress, and
 * per-prompt reset. Used identically by the docked side-panel and by each
 * expanded floating bubble, so both presentation modes share one answer state.
 */
export default function OrderingControls({
  active,
  siblings,
  promptIndex,
  ordered,
  disabled,
  verdict,
  expected,
  onPromptChange,
  onOrderingChange,
}: Props) {
  const items = orderedItems(ordered, active);
  const remaining = unusedItems(ordered, active);
  const sentenceText = joinedSentence(items);
  const graded = verdict !== undefined && GRADED_VERDICTS.has(verdict);
  const expectedSequence = graded ? (expected ?? []) : [];

  const handleChipRemove = (itemId: string) => {
    onOrderingChange(active.id, removeItem(ordered, itemId));
  };

  const handleChipMove = (index: number, direction: -1 | 1) => {
    onOrderingChange(active.id, moveItem(ordered, index, direction));
  };

  return (
    <>
      <div className="ordering-panel-prompt">
        <button
          type="button"
          className="ordering-panel-nav"
          aria-label="Previous sentence"
          disabled={disabled || promptIndex <= 1}
          onClick={() => onPromptChange(siblings[promptIndex - 2].id)}
        >
          ‹
        </button>
        <span className="ordering-panel-prompt-index" aria-live="polite">
          Sentence {promptIndex} / {siblings.length}
        </span>
        <button
          type="button"
          className="ordering-panel-nav"
          aria-label="Next sentence"
          disabled={disabled || promptIndex >= siblings.length}
          onClick={() => onPromptChange(siblings[promptIndex].id)}
        >
          ›
        </button>
      </div>
      <div className="ordering-panel-body" aria-live="polite">
        {items.length === 0 ? (
          <span className="ordering-panel-empty">
            Select the words on the page in the correct order.
          </span>
        ) : (
          <ol className="ordering-chips" aria-label="Constructed sentence">
            {items.map((item, index) => {
              const positionCorrect = expectedSequence.length > index
                && expectedSequence[index] === item.id;
              const chipClass = [
                'ordering-chip',
                graded && positionCorrect ? 'ordering-chip-correct' : '',
                graded && !positionCorrect ? 'ordering-chip-incorrect' : '',
              ].filter(Boolean).join(' ');
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={chipClass}
                    aria-label={`${item.text} — position ${index + 1}.${graded
                      ? (positionCorrect ? ' Correct position.' : ' Incorrect position.')
                      : ''} Press left or right arrows to move, Delete to remove`}
                    disabled={disabled}
                    onClick={() => handleChipRemove(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === ARROW_LEFT) {
                        event.preventDefault();
                        handleChipMove(index, -1);
                      } else if (event.key === ARROW_RIGHT) {
                        event.preventDefault();
                        handleChipMove(index, 1);
                      } else if (event.key === 'Delete' || event.key === 'Backspace') {
                        event.preventDefault();
                        handleChipRemove(item.id);
                      }
                    }}
                  >
                    <span className="ordering-chip-index" aria-hidden="true">{index + 1}</span>
                    <span className="ordering-chip-text">{item.text}</span>
                    <span className="ordering-chip-remove" aria-hidden="true">×</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="ordering-panel-footer">
        <span className="ordering-panel-progress" aria-live="polite">
          {items.length} / {active.items.length}
          {remaining.length > 0 ? ` · ${remaining.length} remaining` : ' · complete'}
        </span>
        <button
          type="button"
          className="ordering-reset"
          aria-label={`Reset sentence ${promptIndex}`}
          disabled={disabled || items.length === 0}
          onClick={() => onOrderingChange(active.id, [])}
        >
          Reset
        </button>
      </div>
      <div className="sr-only" aria-live="polite">
        {sentenceText || 'No sentence constructed yet'}
      </div>
    </>
  );
}
