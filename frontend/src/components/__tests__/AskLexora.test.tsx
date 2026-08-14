// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AskLexora from '../AskLexora';

function stubFetchResponse(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).__lexoraTurnstile;
});

const baseProps = {
  bookId: 'book-1',
  pageNumber: 2,
  exercise: { exerciseId: 'blank-01', kind: 'fill-in-line', answer: null, canCheck: false },
  siteKey: null,
};

describe('AskLexora', () => {
  it('shows Hint, Explain, and Translate actions when opened', () => {
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Explain' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translate to English' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translate to Spanish' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check with AI' })).toBeNull();
  });

  it('offers Check with AI only for a genuinely ungraded, answered exercise', () => {
    render(<AskLexora {...baseProps} exercise={{
      exerciseId: 'ft-01', kind: 'free-text', answer: 'Mein Morgen', canCheck: true,
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    expect(screen.getByRole('button', { name: 'Check with AI' })).toBeTruthy();
  });

  it('renders the result and AI-review label on a successful check', async () => {
    stubFetchResponse(200, {
      action: 'check', status: 'success', content: 'Looks plausible.',
      verdict: 'likely_correct', cached: false, siteKey: null, message: null,
    });
    render(<AskLexora {...baseProps} exercise={{
      exerciseId: 'ft-01', kind: 'free-text', answer: 'Mein Morgen', canCheck: true,
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check with AI' }));

    await waitFor(() => {
      expect(screen.getByText('Looks plausible.')).toBeTruthy();
    });
    expect(screen.getByText('Likely correct')).toBeTruthy();
    expect(screen.getByText('AI-assisted review · not source-backed')).toBeTruthy();
  });

  it('shows the Turnstile widget when verification is required', async () => {
    stubFetchResponse(200, {
      action: 'hint', status: 'verification_required', content: null,
      verdict: null, cached: false, siteKey: 'site-key', message: null,
    });
    render(<AskLexora {...baseProps} siteKey="site-key" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));

    await waitFor(() => {
      expect(screen.getByText(/verify you're human/i)).toBeTruthy();
    });
    const widget = document.querySelector('.cf-turnstile');
    expect(widget).not.toBeNull();
    expect(widget?.getAttribute('data-sitekey')).toBe('site-key');
  });

  it('shows a clean message when the provider is unavailable', async () => {
    stubFetchResponse(200, {
      action: 'hint', status: 'unavailable', content: null,
      verdict: null, cached: false, siteKey: null, message: null,
    });
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));

    await waitFor(() => {
      expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    });
  });

  it('renders the trigger as a secondary action', () => {
    render(<AskLexora {...baseProps} />);
    const trigger = screen.getByRole('button', { name: 'Ask Lexora' });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
