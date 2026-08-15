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

  it('keeps Classic requests selection-only even when stale exercise state exists', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        action: 'explain', status: 'success', content: 'Context.',
        verdict: null, cached: false, siteKey: null, message: null,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AskLexora
      {...baseProps}
      mode="classic"
      selection={{ x: 0.1, y: 0.2, width: 0.4, height: 0.1 }}
      selectionHasContext
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.exerciseId).toBeNull();
    expect(body.answer).toBeNull();
    expect(body.selection).toEqual({ x: 0.1, y: 0.2, width: 0.4, height: 0.1 });
  });

  it('uses the canonical assist id for grouped Interactive exercises', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        action: 'explain', status: 'success', content: 'Context.',
        verdict: null, cached: false, siteKey: null, message: null,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AskLexora {...baseProps} exercise={{
      exerciseId: 'grid-row-1', assistExerciseId: 'grid-1', kind: 'choice-grid',
      answer: 'option-a', canCheck: false,
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(JSON.parse(calls[0][1].body as string).exerciseId).toBe('grid-1');
  });

  it('renders limited Markdown as safe semantic content', async () => {
    stubFetchResponse(200, {
      action: 'explain', status: 'success',
      content: '**Use** this.\n\n- <script>alert(1)</script>\n\n1. `der`',
      verdict: null, cached: false, siteKey: null, message: null,
    });
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await waitFor(() => expect(screen.getByText('Use')).toBeTruthy());
    expect(document.querySelector('strong')).not.toBeNull();
    expect(document.querySelector('ul')).not.toBeNull();
    expect(document.querySelector('ol')).not.toBeNull();
    expect(document.querySelector('.ask-lexora-markdown script')).toBeNull();
  });

  it('provides a keyboard-accessible collapse affordance', () => {
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Ask Lexora' }));
    expect(screen.getByRole('button', { name: 'Expand Ask Lexora' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull();
  });

  it('renders the trigger as a secondary action', () => {
    render(<AskLexora {...baseProps} />);
    const trigger = screen.getByRole('button', { name: 'Ask Lexora' });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
