import type { SentenceOrderingInteraction } from './types';
import { groupSentenceOrderings } from './overlay';
import { parseOrderedAnswer } from './ordering';
import OrderingControls from './OrderingControls';
import type { CorrectionVerdict } from '../state/correction';

interface Props {
  sentenceOrderings: SentenceOrderingInteraction[];
  orderingAnswers: Record<string, string>;
  activePromptId: string | null;
  disabled: boolean;
  collapsed: boolean;
  verdictByItem: Record<string, CorrectionVerdict | undefined>;
  expectedSequencesByItem: Record<string, string[]>;
  onPromptChange: (interactionId: string) => void;
  onOrderingChange: (interactionId: string, ordered: string[]) => void;
  onCollapseChange: (collapsed: boolean) => void;
  onFloat: () => void;
}

/**
 * Docked sentence-ordering panel. Lives in the right rail and shares the exact
 * same answer/order state as the floating bubbles; "Float" hands the same UI
 * back to the in-page bubbles.
 */
export default function SentenceOrderingPanel({
  sentenceOrderings,
  orderingAnswers,
  activePromptId,
  disabled,
  collapsed,
  verdictByItem,
  expectedSequencesByItem,
  onPromptChange,
  onOrderingChange,
  onCollapseChange,
  onFloat,
}: Props) {
  const exercises = groupSentenceOrderings(sentenceOrderings);
  const active = sentenceOrderings.find((i) => i.id === activePromptId)
    ?? sentenceOrderings[0];
  if (!active) return null;

  const siblings = exercises[active.exerciseId] ?? [active];
  const promptIndex = siblings.findIndex((i) => i.id === active.id) + 1;

  if (collapsed) {
    return (
      <section className="ordering-panel ordering-panel-collapsed" aria-label="Sentence ordering panel">
        <div className="ordering-panel-head">
          <span className="ordering-panel-title">Satz {promptIndex} / {siblings.length}</span>
          <div className="ordering-panel-head-actions">
            <button
              type="button"
              className="ordering-panel-toggle"
              aria-label="Expand sentence ordering panel"
              onClick={() => onCollapseChange(false)}
            >
              ▸
            </button>
            <button
              type="button"
              className="ordering-panel-toggle"
              aria-label="Float sentence ordering panel"
              title="Float ordering as in-page bubbles"
              onClick={onFloat}
            >
              ⛶
            </button>
          </div>
        </div>
      </section>
    );
  }

  const ordered = parseOrderedAnswer(orderingAnswers[active.id]);

  return (
    <section className="ordering-panel" aria-label={`Sentence ordering ${promptIndex} of ${siblings.length}`}>
      <div className="ordering-panel-head">
        <span className="ordering-panel-title">Sentence ordering</span>
        <div className="ordering-panel-head-actions">
          <button
            type="button"
            className="ordering-panel-toggle"
            aria-label="Float sentence ordering panel"
            title="Float ordering as in-page bubbles"
            onClick={onFloat}
          >
            ⛶
          </button>
          <button
            type="button"
            className="ordering-panel-toggle"
            aria-label="Minimize sentence ordering panel"
            onClick={() => onCollapseChange(true)}
          >
            ▾
          </button>
        </div>
      </div>
      <OrderingControls
        active={active}
        siblings={siblings}
        promptIndex={promptIndex}
        ordered={ordered}
        disabled={disabled}
        verdict={verdictByItem[active.id]}
        expected={expectedSequencesByItem[active.id]}
        onPromptChange={onPromptChange}
        onOrderingChange={onOrderingChange}
      />
    </section>
  );
}
