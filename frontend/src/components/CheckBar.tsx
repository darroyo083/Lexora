import { Check } from 'lucide-react';

interface CheckBarProps {
  totalGradable: number;
  totalCorrect: number;
  uiState: string;
  hasAnswerKey: boolean;
  onCheck: () => void;
}

export default function CheckBar({
  totalGradable,
  totalCorrect,
  uiState,
  hasAnswerKey,
  onCheck,
}: CheckBarProps) {
  const hasChecked = uiState === 'CHECKED' || uiState === 'REVEALED';
  const totalGradableChecked = totalGradable > 0;

  return (
    <div className="check-bar">
      {totalGradableChecked && hasChecked && (
        <span className="check-bar-rollup">
          {totalCorrect} of {totalGradable} correct
        </span>
      )}
      {!hasChecked && (
        <span className="check-bar-hint">
          {hasAnswerKey ? 'Exercises ready to check' : 'Answer key not available'}
        </span>
      )}
      <button
        type="button"
        className="check-bar-btn"
        onClick={onCheck}
        disabled={!hasAnswerKey}
        aria-label="Check answers (Ctrl+Enter)"
      >
        <Check size={15} />
        <span>Check answers</span>
        <kbd>Ctrl+Enter</kbd>
      </button>
    </div>
  );
}
