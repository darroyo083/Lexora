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
  delete (window as unknown as Record<string, unknown>).turnstile;
  document.querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]').forEach((script) => script.remove());
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

  it('offers AI feedback only for a genuinely ungraded, answered open response', () => {
    render(<AskLexora {...baseProps} exercise={{
      exerciseId: 'ft-01', kind: 'free-text', answer: 'Mein Morgen', canCheck: true,
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    expect(screen.getByRole('button', { name: 'Get AI feedback' })).toBeTruthy();
  });

  it('does not offer AI feedback in place of deterministic grading', () => {
    render(<AskLexora {...baseProps} exercise={{
      exerciseId: 'blank-01', kind: 'fill-in-line', answer: 'gehe', canCheck: true,
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    expect(screen.queryByRole('button', { name: 'Get AI feedback' })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Get AI feedback' }));

    await waitFor(() => {
      expect(screen.getByText('Looks plausible.')).toBeTruthy();
    });
    expect(screen.getByText('AI-assisted feedback')).toBeTruthy();
    expect(screen.getByText('Not source-backed · no automatic grade')).toBeTruthy();
  });

  it('explicitly renders Turnstile when verification is required', async () => {
    const renderWidget = vi.fn(() => 'widget-1');
    const removeWidget = vi.fn();
    (window as unknown as Record<string, unknown>).turnstile = {
      render: renderWidget,
      remove: removeWidget,
    };
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
    expect(renderWidget).toHaveBeenCalledWith(widget, expect.objectContaining({
      sitekey: 'site-key',
      callback: expect.any(Function),
    }));
  });

  it('renders a fresh Turnstile widget after the Classic selection changes', async () => {
    const renderWidget = vi.fn()
      .mockReturnValueOnce('widget-1')
      .mockReturnValueOnce('widget-2');
    const removeWidget = vi.fn();
    (window as unknown as Record<string, unknown>).turnstile = {
      render: renderWidget,
      remove: removeWidget,
    };
    stubFetchResponse(200, {
      action: 'explain', status: 'verification_required', content: null,
      verdict: null, cached: false, siteKey: 'site-key', message: null,
    });
    const selectionA = { x: 0.1, y: 0.2, width: 0.4, height: 0.1 };
    const selectionB = { x: 0.1, y: 0.5, width: 0.4, height: 0.1 };
    const view = render(<AskLexora
      {...baseProps}
      mode="classic"
      siteKey="site-key"
      selection={selectionA}
      selectionHasContext
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));

    view.rerender(<AskLexora
      {...baseProps}
      mode="classic"
      siteKey="site-key"
      selection={selectionB}
      selectionHasContext
    />);
    fireEvent.click(await screen.findByRole('button', { name: 'Explain' }));
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2));
    expect(removeWidget).toHaveBeenCalledWith('widget-1');
  });

  it('ignores late Turnstile callbacks after success and accepts the next Classic region', async () => {
    const renderWidget = vi.fn().mockReturnValue('widget-1');
    const removeWidget = vi.fn();
    (window as unknown as Record<string, unknown>).turnstile = {
      render: renderWidget,
      remove: removeWidget,
    };
    let callNumber = 0;
    const fetchMock = vi.fn(() => {
      callNumber += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(callNumber === 1
          ? {
            action: 'explain', status: 'verification_required', content: null,
            verdict: null, cached: false, siteKey: 'site-key', message: null,
          }
          : {
            action: 'explain', status: 'success', content: `Region ${callNumber} success.`,
            verdict: null, cached: false, siteKey: null, message: null,
          }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const selectionA = { x: 0.1, y: 0.2, width: 0.4, height: 0.1 };
    const selectionB = { x: 0.1, y: 0.5, width: 0.4, height: 0.1 };
    const view = render(<AskLexora
      {...baseProps}
      mode="classic"
      siteKey="site-key"
      selection={selectionA}
      selectionHasContext
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
    const tokenCallback = renderWidget.mock.calls[0][1].callback as (token: string) => void;
    tokenCallback('valid-token');
    await waitFor(() => expect(screen.getByText('Region 2 success.')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    tokenCallback('late-token');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    view.rerender(<AskLexora
      {...baseProps}
      mode="classic"
      siteKey="site-key"
      selection={selectionB}
      selectionHasContext
    />);
    fireEvent.click(await screen.findByRole('button', { name: 'Explain' }));
    await waitFor(() => expect(screen.getByText('Region 3 success.')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(JSON.parse(calls[2][1].body as string).selection).toEqual(selectionB);
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

  it('starts a Classic request while local text readiness is still settling', async () => {
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
      selectionHasContext={false}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Context.')).toBeTruthy();
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
      content: '### A useful pattern\n\n**Use** this.\nline two stays in the paragraph.\n\n• First point\n◦ Second point\n\n1. `der`\n\n<script>alert(1)</script>',
      verdict: null, cached: false, siteKey: null, message: null,
    });
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await waitFor(() => expect(screen.getByText('Use')).toBeTruthy());
    expect(document.querySelector('strong')).not.toBeNull();
    expect(document.querySelector('h3')?.textContent).toBe('A useful pattern');
    expect(document.querySelector('ul')).not.toBeNull();
    expect(document.querySelector('ul')?.children).toHaveLength(2);
    expect(document.querySelector('ol')).not.toBeNull();
    expect(document.querySelector('.ask-lexora-markdown script')).toBeNull();
    expect(screen.queryByText(/<script>/)).toBeNull();
  });

  it('returns from the question flow to the action chooser', () => {
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask a question…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Ask Lexora actions' }));
    expect(screen.getByRole('button', { name: 'Explain' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Ask about this exercise' })).toBeNull();
  });

  it('submits a question with Enter and reserves Shift+Enter for a newline', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        action: 'ask', status: 'success', content: 'A focused answer.',
        verdict: null, cached: false, siteKey: null, message: null,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask a question…' }));
    const question = screen.getByRole('textbox', { name: 'Ask about this exercise' });
    fireEvent.change(question, { target: { value: 'Why is this dative?' } });
    fireEvent.keyDown(question, { key: 'Enter', shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(question, { key: 'Enter' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('A focused answer.')).toBeTruthy());
  });

  it('uses the shared processing loader and pending-text treatment', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<AskLexora {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Lexora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    expect(document.querySelectorAll('.ask-lexora-loading-orb')).toHaveLength(1);
    expect(document.querySelector('.ask-lexora-pending-copy')).not.toBeNull();
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
