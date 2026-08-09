import { Check, X, Eye, Minus } from 'lucide-react';
import { CorrectionVerdict, AnswerResolutionStatus } from '../state/correction';

interface VerdictPillProps {
  verdict: CorrectionVerdict | null | undefined;
  resolution: AnswerResolutionStatus | null;
  revealed: boolean;
  details?: { correctCount: number; totalCount: number };
  interactionKind?: string;
}

const verdictLabel: Record<string, string> = {
  [CorrectionVerdict.CORRECT]: 'Correct',
  [CorrectionVerdict.INCORRECT]: 'Incorrect',
  [CorrectionVerdict.PARTIALLY_CORRECT]: '',
  [CorrectionVerdict.UNANSWERED]: 'Not answered',
  [CorrectionVerdict.NOT_AUTO_GRADABLE]: 'Manual review',
};

export default function VerdictPill({
  verdict,
  resolution,
  revealed,
  details,
}: VerdictPillProps) {
  if (revealed) {
    return (
      <span className="verdict-pill revealed" aria-label="Answer revealed">
        <Eye size={13} />
        <span>Revealed</span>
      </span>
    );
  }

  if (!verdict) {
    if (resolution === AnswerResolutionStatus.UNMAPPED) {
      return (
        <span className="verdict-pill neutral" aria-label="No answer key available">
          <Minus size={13} />
          <span>No answer key available</span>
        </span>
      );
    }
    return null;
  }

  if (verdict === CorrectionVerdict.CORRECT) {
    return (
      <span className="verdict-pill correct" aria-label="Correct">
        <Check size={13} />
        <span>{verdictLabel[verdict]}</span>
      </span>
    );
  }

  if (verdict === CorrectionVerdict.INCORRECT) {
    return (
      <span className="verdict-pill incorrect" aria-label="Incorrect">
        <X size={13} />
        <span>{verdictLabel[verdict]}</span>
      </span>
    );
  }

  if (verdict === CorrectionVerdict.PARTIALLY_CORRECT) {
    const countText = details
      ? `${details.correctCount} of ${details.totalCount} correct`
      : 'Partially correct';
    return (
      <span className="verdict-pill partial" aria-label={countText}>
        <span className="partial-dots">
          <span className="dot ok" />
          <span className="dot err" />
        </span>
        <span>{countText}</span>
      </span>
    );
  }

  if (verdict === CorrectionVerdict.UNANSWERED) {
    return (
      <span className="verdict-pill unanswered" aria-label="Not answered">
        <Minus size={13} />
        <span>{verdictLabel[verdict]}</span>
      </span>
    );
  }

  if (verdict === CorrectionVerdict.NOT_AUTO_GRADABLE) {
    return (
      <span className="verdict-pill not-auto-gradable" aria-label="Not auto-gradable">
        <Eye size={13} />
        <span>{verdictLabel[verdict]}</span>
      </span>
    );
  }

  return null;
}
