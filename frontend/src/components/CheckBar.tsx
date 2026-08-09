import { Check } from 'lucide-react';

interface CheckBarProps {
  totalGradable: number;
  totalCorrect: number;
  uiState: string;
  hasAnswerKey: boolean;
  anyRevealed: boolean;
  onCheck: () => void;
}

export default function CheckBar({
  totalGradable,
  totalCorrect,
  uiState,
  hasAnswerKey,
  anyRevealed,
  onCheck,
}: CheckBarProps) {
  const hasChecked = uiState === 'CHECKED' || uiState === 'REVEALED';
  const totalGradableChecked = totalGradable > 0;
  const checkDisabled = !hasAnswerKey || anyRevealed;

  return (
    <div className="check-bar">
      {totalGradableChecked && hasChecked && (
        <span className="check-bar-rollup">
          {totalCorrect} of {totalGradable} correct
        </span>
      )}
      {!hasChecked && (
        <span className="check-bar-hint">
          {hasAnswerKey
            ? (anyRevealed ? 'Retry revealed items to check again' : 'Exercises ready to check')
            : 'Answer key not available'}
        </span>
      )}
      <button
        type="button"
        className="check-bar-btn"
        onClick={onCheck}
        disabled={checkDisabled}
        aria-label={checkDisabled ? 'Check answers unavailable while an answer is revealed' : 'Check answers (Ctrl+Enter)'}
      >
        <Check size={15} />
        <span>Check answers</span>
        <kbd>Ctrl+Enter</kbd>
      </button>
    </div>
  );
}
