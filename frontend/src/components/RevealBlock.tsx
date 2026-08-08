import { Eye, EyeOff } from 'lucide-react';

interface RevealBlockProps {
  itemId: string;
  revealed: boolean;
  learnerLabel: string;
  expectedLabel: string;
  hasReference?: boolean;
  referenceText?: string;
  acceptedAlternatives?: string[];
  isFreeText?: boolean;
  onReveal: (itemId: string) => void;
  onRetry: (itemId: string) => void;
}

export default function RevealBlock({
  itemId,
  revealed,
  learnerLabel,
  expectedLabel,
  hasReference,
  referenceText,
  acceptedAlternatives,
  isFreeText,
  onReveal,
  onRetry,
}: RevealBlockProps) {
  if (isFreeText) {
    return (
      <div className="reveal-block free-text-reveal">
        {hasReference && referenceText ? (
          <div className="reveal-block-section">
            <button
              type="button"
              className="reveal-toggle"
              aria-expanded={revealed}
              onClick={() => onReveal(itemId)}
              disabled={revealed}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{revealed ? 'Reference shown' : 'Reference answer'}</span>
            </button>
            {revealed && (
              <blockquote className="reference-answer">
                {referenceText}
              </blockquote>
            )}
          </div>
        ) : (
          <p className="no-reference">No reference answer recorded.</p>
        )}
        {revealed && (
          <button
            type="button"
            className="try-again-btn"
            onClick={() => onRetry(itemId)}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="reveal-block">
      <div className="reveal-block-compare">
        <div className="reveal-block-row learner">
          <span className="reveal-block-label">Your answer:</span>
          <span className="reveal-block-value">{learnerLabel || '(empty)'}</span>
        </div>
        {revealed && (
          <div className="reveal-block-row expected">
            <span className="reveal-block-label">Answer key:</span>
            <span className="reveal-block-value">{expectedLabel}</span>
          </div>
        )}
        {revealed && acceptedAlternatives && acceptedAlternatives.length > 0 && (
          <div className="reveal-block-row alternatives">
            <span className="reveal-block-label">Accepted:</span>
            <span className="reveal-block-value">
              {acceptedAlternatives.join(', ')}
            </span>
          </div>
        )}
      </div>
      <div className="reveal-block-actions">
        <button
          type="button"
          className="reveal-toggle"
          aria-expanded={revealed}
          onClick={() => onReveal(itemId)}
          disabled={revealed}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{revealed ? 'Revealed' : 'Show answer'}</span>
        </button>
        <button
          type="button"
          className="try-again-btn"
          onClick={() => onRetry(itemId)}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
