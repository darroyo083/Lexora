// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CheckBar from '../CheckBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});

describe('CheckBar', () => {
  const baseProps = {
    totalGradable: 0,
    totalCorrect: 0,
    uiState: 'IDLE',
    hasAnswerKey: true,
    anyRevealed: false,
    onCheck: vi.fn(),
  };

  it('is disabled without an answer key', () => {
    render(<CheckBar {...baseProps} hasAnswerKey={false} />);
    expect((screen.getByRole('button', { name: /Answers cannot/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is disabled while any item is revealed (frozen semantics)', () => {
    render(<CheckBar {...baseProps} anyRevealed />);
    expect((screen.getByRole('button', { name: /Answers cannot/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is enabled when an answer key exists and nothing is revealed', () => {
    render(<CheckBar {...baseProps} />);
    const button = screen.getByRole('button', { name: /Check answers/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(baseProps.onCheck).toHaveBeenCalled();
  });

  it('shows the rollup after checking', () => {
    render(
      <CheckBar
        {...baseProps}
        uiState="CHECKED"
        totalGradable={3}
        totalCorrect={2}
      />,
    );
    expect(screen.getByText('2 of 3 correct')).toBeTruthy();
  });

  it('shows the retry hint when revealed blocks checking', () => {
    render(<CheckBar {...baseProps} anyRevealed />);
    expect(screen.getByText('Try the revealed exercises again')).toBeTruthy();
  });

  it('reduces the classic control to one clear action', () => {
    render(<CheckBar {...baseProps} compact />);
    expect(screen.queryByText('Check answers on this page')).toBeNull();
    expect(screen.queryByText('Ctrl+Enter')).toBeNull();
    expect(screen.getByRole('button', { name: /Check answers/ })).toBeTruthy();
  });
});
