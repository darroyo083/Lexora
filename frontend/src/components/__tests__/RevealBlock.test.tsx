// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RevealBlock from '../RevealBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

describe('RevealBlock (gradable items)', () => {
  const baseProps = {
    itemId: 'b1',
    revealed: false,
    learnerLabel: 'bin',
    expectedLabel: 'bin',
    acceptedAlternatives: ['ist', 'war'],
    onReveal: vi.fn(),
    onRetry: vi.fn(),
  };

  it('shows the learner answer without the answer key before reveal', () => {
    render(<RevealBlock {...baseProps} />);
    expect(screen.getByText('bin')).toBeTruthy();
    expect(screen.queryByText('Answer key:')).toBeNull();
    expect(screen.queryByText('Accepted:')).toBeNull();
  });

  it('is keyboard accessible with aria-expanded false before reveal', () => {
    render(<RevealBlock {...baseProps} />);
    const toggle = screen.getByRole('button', { name: /Show answer/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('calls onReveal with the item id when invoked', () => {
    render(<RevealBlock {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    expect(baseProps.onReveal).toHaveBeenCalledWith('b1');
  });

  it('reveals expected value and accepted alternatives without mutating the learner value', () => {
    const learnerValue = 'bin';
    render(<RevealBlock {...baseProps} learnerLabel={learnerValue} revealed />);
    expect(screen.getAllByText('bin').length).toBe(2);
    expect(screen.getByText('Answer key:')).toBeTruthy();
    expect(screen.getByText('ist, war')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Revealed/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('bin').length).toBe(2);
  });

  it('hides the answer key when not revealed', () => {
    render(<RevealBlock {...baseProps} revealed={false} />);
    expect(screen.queryByText('Answer key:')).toBeNull();
    expect(screen.queryByText('Accepted:')).toBeNull();
  });

  it('does not show Try again before reveal, shows it after', () => {
    const { rerender } = render(<RevealBlock {...baseProps} revealed={false} />);
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
    rerender(<RevealBlock {...baseProps} revealed />);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(baseProps.onRetry).toHaveBeenCalledWith('b1');
  });

  it('renders empty placeholder for a missing learner value', () => {
    render(<RevealBlock {...baseProps} learnerLabel="" revealed />);
    expect(screen.getByText('(empty)')).toBeTruthy();
  });
});

describe('RevealBlock (free text)', () => {
  const baseProps = {
    itemId: 'ft1',
    revealed: false,
    learnerLabel: '',
    expectedLabel: '',
    isFreeText: true,
    onReveal: vi.fn(),
    onRetry: vi.fn(),
  };

  it('reveals the reference text when one is recorded', () => {
    render(
      <RevealBlock
        {...baseProps}
        hasReference
        referenceText="Der Hund spielt im Garten."
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Reference answer/ }));
    expect(baseProps.onReveal).toHaveBeenCalledWith('ft1');
  });

  it('renders the reference answer text once revealed', () => {
    render(
      <RevealBlock
        {...baseProps}
        revealed
        hasReference
        referenceText="Der Hund spielt im Garten."
      />,
    );
    expect(screen.getByText('Der Hund spielt im Garten.')).toBeTruthy();
  });

  it('states when no reference answer is recorded', () => {
    render(<RevealBlock {...baseProps} hasReference={false} />);
    expect(screen.getByText('No reference answer recorded.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reference answer/ })).toBeNull();
  });
});
