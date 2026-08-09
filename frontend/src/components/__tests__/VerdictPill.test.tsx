// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import VerdictPill from '../VerdictPill';
import { CorrectionVerdict, AnswerResolutionStatus } from '../../state/correction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

describe('VerdictPill', () => {
  it('renders Correct for CORRECT', () => {
    render(<VerdictPill verdict={CorrectionVerdict.CORRECT} resolution={AnswerResolutionStatus.RESOLVED} revealed={false} />);
    expect(screen.getByText('Correct')).toBeTruthy();
    expect(screen.getByLabelText('Correct')).toBeTruthy();
  });

  it('renders Incorrect for INCORRECT', () => {
    render(<VerdictPill verdict={CorrectionVerdict.INCORRECT} resolution={AnswerResolutionStatus.RESOLVED} revealed={false} />);
    expect(screen.getByText('Incorrect')).toBeTruthy();
  });

  it('renders pair counts for PARTIALLY_CORRECT', () => {
    render(
      <VerdictPill
        verdict={CorrectionVerdict.PARTIALLY_CORRECT}
        resolution={AnswerResolutionStatus.RESOLVED}
        revealed={false}
        details={{ correctCount: 1, totalCount: 3 }}
      />,
    );
    expect(screen.getByText('1 of 3 correct')).toBeTruthy();
  });

  it('renders Not answered for UNANSWERED', () => {
    render(<VerdictPill verdict={CorrectionVerdict.UNANSWERED} resolution={AnswerResolutionStatus.RESOLVED} revealed={false} />);
    expect(screen.getByText('Not answered')).toBeTruthy();
  });

  it('renders Manual review for NOT_AUTO_GRADABLE', () => {
    render(<VerdictPill verdict={CorrectionVerdict.NOT_AUTO_GRADABLE} resolution={AnswerResolutionStatus.MISSING} revealed={false} />);
    expect(screen.getByText('Manual review')).toBeTruthy();
  });

  it('stays neutral for UNMAPPED: no verdict label', () => {
    render(<VerdictPill verdict={null} resolution={AnswerResolutionStatus.UNMAPPED} revealed={false} />);
    expect(screen.getByText('No answer key available')).toBeTruthy();
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByText('Incorrect')).toBeNull();
  });

  it('renders nothing for AMBIGUOUS (no verdict, never implies correctness)', () => {
    const { container } = render(
      <VerdictPill verdict={null} resolution={AnswerResolutionStatus.AMBIGUOUS} revealed={false} />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders nothing for EXTRACTION_UNCERTAIN', () => {
    const { container } = render(
      <VerdictPill verdict={null} resolution={AnswerResolutionStatus.EXTRACTION_UNCERTAIN} revealed={false} />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders the revealed pill instead of the verdict when revealed', () => {
    render(
      <VerdictPill
        verdict={CorrectionVerdict.INCORRECT}
        resolution={AnswerResolutionStatus.RESOLVED}
        revealed
      />,
    );
    expect(screen.getByText('Revealed')).toBeTruthy();
    expect(screen.queryByText('Incorrect')).toBeNull();
  });
});
