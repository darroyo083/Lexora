import { Check } from 'lucide-react';

interface CheckBarProps {
  totalGradable: number;
  totalCorrect: number;
  uiState: string;
  hasAnswerKey: boolean;
  anyRevealed: boolean;
  onCheck: () => void;
  compact?: boolean;
}

export default function CheckBar({
  totalGradable,
  totalCorrect,
  uiState,
  hasAnswerKey,
  anyRevealed,
  onCheck,
  compact = false,
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
      {!compact && !hasChecked && (
        <span className="check-bar-hint">
          {hasAnswerKey
            ? (anyRevealed ? 'Try the revealed exercises again' : 'Check answers on this page')
            : 'No answer key is available for this page'}
        </span>
      )}
      <button
        type="button"
        className="check-bar-btn"
        onClick={onCheck}
        disabled={checkDisabled}
        aria-label={checkDisabled ? 'Answers cannot be checked right now' : 'Check answers (Ctrl+Enter)'}
      >
        <Check size={15} />
        <span>Check answers</span>
        {!compact && <kbd>Ctrl+Enter</kbd>}
      </button>
    </div>
  );
}
