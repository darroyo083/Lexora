import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2, Sparkles, X } from 'lucide-react';
import {
  requestAssist,
  type AssistAction,
  type AssistResponse,
  type ExerciseContext,
  type SelectionRect,
} from '../api/assist';
import AiPendingState from './AiPendingState';
import LimitedMarkdown from './LimitedMarkdown';

interface Props {
  bookId: string | null;
  pageNumber: number;
  exercise: ExerciseContext | null;
  siteKey: string | null;
  mode?: 'interactive' | 'classic';
  selection?: SelectionRect | null;
  selectionHasContext?: boolean;
  onStartSelection?: () => void;
  onClearSelection?: () => void;
}

type Phase = 'idle' | 'working' | 'verifying' | 'done';

interface PendingPayload {
  requestId: number;
  contextKey: string;
  action: AssistAction;
  targetLanguage: string | null;
  question: string | null;
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
  }) => string;
  remove: (widgetId: string) => void;
}

function turnstileApi(): TurnstileApi | null {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile ?? null;
}

function selectionKey(selection: SelectionRect | null | undefined): string {
  if (!selection) return '';
  return [selection.x, selection.y, selection.width, selection.height].join(',');
}

const VERDICT_LABEL: Record<string, string> = {
  likely_correct: 'Likely correct',
  likely_incorrect: 'Likely incorrect',
  uncertain: 'Uncertain',
};

function statusMessage(response: AssistResponse): string {
  switch (response.status) {
    case 'disabled':
      return 'AI help is not available right now.';
    case 'limit_reached':
      return response.message ?? 'AI help is temporarily unavailable. Please try again later.';
    case 'unavailable':
      return 'AI help is temporarily unavailable. Please try again.';
    case 'not_applicable':
      return response.message ?? 'AI help is not available for this exercise.';
    case 'invalid_context':
      return response.message ?? 'We could not connect that request to the source. Try another exercise or selection.';
    default:
      return 'AI help is temporarily unavailable. Please try again.';
  }
}

export default function AskLexora({
  bookId,
  pageNumber,
  exercise,
  siteKey,
  mode = 'interactive',
  selection = null,
  selectionHasContext = false,
  onStartSelection,
  onClearSelection,
}: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeAction, setActiveAction] = useState<AssistAction | null>(null);
  const [result, setResult] = useState<AssistResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [questionOpen, setQuestionOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pendingRef = useRef<PendingPayload | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  phaseRef.current = phase;
  const contextKey = [
    mode,
    bookId ?? '',
    pageNumber,
    mode === 'classic' ? selectionKey(selection) : exercise?.assistExerciseId ?? exercise?.exerciseId ?? '',
  ].join('|');
  const contextKeyRef = useRef(contextKey);
  contextKeyRef.current = contextKey;

  const resetToMenu = useCallback(() => {
    requestIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    pendingRef.current = null;
    setPhase('idle');
    setActiveAction(null);
    setResult(null);
    setMessage(null);
    setQuestionDraft('');
    setQuestionOpen(false);
  }, []);

  const closePanel = useCallback(() => {
    resetToMenu();
    setOpen(false);
    setCollapsed(false);
    triggerRef.current?.focus();
  }, [resetToMenu]);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  const runAction = useCallback(async (
    action: AssistAction,
    targetLanguage: string | null,
    turnstileToken: string | null,
    question: string | null = null,
  ) => {
    if (!bookId || (mode === 'interactive' && !exercise) || (mode === 'classic' && !selection)) {
      setActiveAction(null);
      setResult(null);
      setMessage(mode === 'classic'
        ? 'Select a readable source region to continue.'
        : 'Select an exercise to continue.');
      setPhase('done');
      return;
    }
    setPhase('working');
    setActiveAction(action);
    setResult(null);
    setMessage(null);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestContextKey = contextKeyRef.current;
    pendingRef.current = { requestId, contextKey: requestContextKey, action, targetLanguage, question };
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let awaitingVerification = false;
    const isCurrentRequest = () => requestIdRef.current === requestId
      && contextKeyRef.current === requestContextKey;
    try {
      const response = await requestAssist({
        action,
        bookId,
        pageNumber,
        // The mode is a security boundary: never send stale Interactive
        // exercise state with a Classic selection request.
        exerciseId: mode === 'interactive'
          ? exercise?.assistExerciseId ?? exercise?.exerciseId ?? null
          : null,
        answer: mode === 'interactive' && action === 'check'
          ? exercise?.answer ?? null
          : null,
        targetLanguage,
        question,
        selection: mode === 'classic' ? selection : null,
        turnstileToken,
      }, controller.signal);
      if (!isCurrentRequest()) return;
      if (response.status === 'verification_required') {
        awaitingVerification = true;
        setPhase('verifying');
        return;
      }
      pendingRef.current = null;
      if (response.status === 'success') {
        setResult(response);
        setPhase('done');
        return;
      }
      setMessage(statusMessage(response));
      setPhase('done');
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      pendingRef.current = null;
      setMessage('AI help is temporarily unavailable. Please try again.');
      setPhase('done');
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (!awaitingVerification && pendingRef.current?.requestId === requestId) {
        pendingRef.current = null;
      }
    }
  }, [bookId, contextKey, mode, pageNumber, exercise, selection]);

  const onTurnstileToken = useCallback((token: string) => {
    const pending = pendingRef.current;
    if (!pending
      || pending.contextKey !== contextKeyRef.current
      || phaseRef.current !== 'verifying') {
      if (pending?.contextKey !== contextKeyRef.current) pendingRef.current = null;
      return;
    }
    void runAction(pending.action, pending.targetLanguage, token, pending.question);
  }, [runAction]);

  useEffect(() => {
    if (phase !== 'verifying' || !siteKey) return;
    let cancelled = false;
    let widgetId: string | null = null;
    const renderWidget = () => {
      const api = turnstileApi();
      if (cancelled || !api || !turnstileRef.current || widgetId) return;
      widgetId = api.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: onTurnstileToken,
      });
    };
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    if (turnstileApi()) renderWidget();
    else script.addEventListener('load', renderWidget);
    return () => {
      cancelled = true;
      script?.removeEventListener('load', renderWidget);
      if (widgetId) turnstileApi()?.remove(widgetId);
    };
  }, [phase, siteKey, onTurnstileToken]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePanel, open]);

  const openPanel = () => {
    resetToMenu();
    setOpen(true);
    setCollapsed(false);
    setPhase('idle');
    setResult(null);
    setMessage(null);
    setQuestionDraft('');
    setQuestionOpen(false);
  };

  const canGoBack = questionOpen || phase !== 'idle';

  useEffect(() => {
    if (mode !== 'classic' || !selection) return;
    resetToMenu();
    setOpen(true);
    setCollapsed(false);
  }, [mode, resetToMenu, contextKey]);

  const hasContext = mode === 'classic'
    ? Boolean(bookId)
    : Boolean(bookId && exercise);
  const isOpenResponse = exercise?.kind === 'free-text';
  const canCheck = Boolean(isOpenResponse && exercise?.canCheck && exercise.answer);

  const items: Array<{ action: AssistAction; label: string; target?: string }> = [
    ...(mode === 'interactive' ? [{ action: 'hint' as AssistAction, label: 'Hint' }] : []),
    { action: 'explain', label: 'Explain' },
    { action: 'translate', label: 'Translate to English', target: 'en' },
    { action: 'translate', label: 'Translate to Spanish', target: 'es' },
    { action: 'ask', label: 'Ask a question…' },
    ...(canCheck ? [{ action: 'check' as AssistAction, label: 'Get AI feedback' }] : []),
  ];

  return (
    <div className="ask-lexora">
      <button
        ref={triggerRef}
        type="button"
        className="ask-lexora-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!hasContext}
        title={mode === 'classic' && !selection
          ? 'Select a region of the source page'
          : hasContext ? 'Ask Lexora for contextual AI help' : 'Select an exercise first'}
        onClick={() => {
          if (mode === 'classic' && !selection) {
            onStartSelection?.();
            return;
          }
          open ? closePanel() : openPanel();
        }}
      >
        <Sparkles size={15} aria-hidden="true" />
        <span>Ask Lexora</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={`ask-lexora-panel${collapsed ? ' is-collapsed' : ''}`}
          role="dialog"
          aria-label="Ask Lexora"
          aria-modal="false"
          tabIndex={-1}
        >
          <div className="ask-lexora-head">
            <div className="ask-lexora-head-main">
              {canGoBack && (
                <button
                  type="button"
                  className="ask-lexora-close"
                  aria-label="Back to Ask Lexora actions"
                  title="Back"
                  onClick={resetToMenu}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
              )}
              <span id="ask-lexora-title">{mode === 'classic' ? 'Ask about this selection' : 'Ask about this exercise'}</span>
            </div>
            <div className="ask-lexora-head-actions">
              <button
                type="button"
                className="ask-lexora-close"
                aria-label={collapsed ? 'Expand Ask Lexora' : 'Collapse Ask Lexora'}
                title={collapsed ? 'Expand' : 'Collapse'}
                onClick={() => {
                  setCollapsed((value) => !value);
                  panelRef.current?.focus();
                }}
              >
                {collapsed ? <Maximize2 size={15} aria-hidden="true" /> : <Minimize2 size={15} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="ask-lexora-close"
                aria-label="Close Ask Lexora"
                title="Close"
                onClick={closePanel}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {!collapsed && phase === 'working' && activeAction && <AiPendingState action={activeAction} />}

          {!collapsed && phase === 'verifying' && (
            <div className="ask-lexora-verifying" role="status">
              <p>Verify you're human once, then Lexora can continue.</p>
              {siteKey && (
                <div
                  ref={turnstileRef}
                  className="cf-turnstile"
                />
              )}
              {!siteKey && <p className="ask-lexora-verifying-error">Verification is unavailable right now. Please try again later.</p>}
            </div>
          )}

          {!collapsed && (phase === 'idle' || phase === 'done') && result === null && !message && (
            questionOpen ? (
              <form className="ask-lexora-question" onSubmit={(event) => {
                event.preventDefault();
                const question = questionDraft.trim();
                if (!question || question.length > 400) return;
                void runAction('ask', null, null, question);
              }}>
                <label htmlFor="lexora-ask-question">{mode === 'classic' ? 'Ask about this selection' : 'Ask about this exercise'}</label>
                <textarea
                  id="lexora-ask-question"
                  value={questionDraft}
                  maxLength={400}
                  rows={3}
                  onChange={(event) => setQuestionDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }}
                  placeholder="What should I look for here?"
                />
                <div className="ask-lexora-question-actions">
                  <small>{questionDraft.length}/400</small>
                  <button type="button" className="ask-lexora-new" onClick={resetToMenu}>Cancel</button>
                  <button type="submit" className="ask-lexora-action" disabled={!questionDraft.trim()}>Ask</button>
                </div>
              </form>
            ) : (
              <div className="ask-lexora-menu" role="group" aria-label="AI help actions">
                {mode === 'classic' && !selectionHasContext && selection && (
                  <p className="ask-lexora-context-note">Lexora will validate this selection against the source.</p>
                )}
                {mode === 'classic' && !selection && (
                  <p className="ask-lexora-context-note">Select a readable source region to continue.</p>
                )}
                {items.map((item) => (
                  <button
                    key={`${item.action}:${item.target ?? ''}`}
                    type="button"
                    className="ask-lexora-action"
                    onClick={() => {
                      if (item.action === 'ask') {
                        setQuestionOpen(true);
                        return;
                      }
                      void runAction(item.action, item.target ?? null, null);
                    }}
                    disabled={mode === 'classic' && !selection}
                  >
                    {item.label}
                  </button>
                ))}
                {mode === 'classic' && onClearSelection && (
                  <button type="button" className="ask-lexora-new" onClick={() => {
                    closePanel();
                    onClearSelection();
                  }}>Choose another region</button>
                )}
              </div>
            )
          )}

          {!collapsed && phase === 'done' && result !== null && (
            <div className="ask-lexora-result" aria-live="polite">
              {result.action === 'check' && isOpenResponse && (
                <div className="ask-lexora-verdict" data-verdict="uncertain">
                  <span>AI-assisted feedback</span>
                  <small>Not source-backed · no automatic grade</small>
                </div>
              )}
              {result.action === 'check' && !isOpenResponse && result.verdict && (
                <div className="ask-lexora-verdict" data-verdict={result.verdict}>
                  <span>{VERDICT_LABEL[result.verdict] ?? result.verdict}</span>
                  <small>AI-assisted review · not source-backed</small>
                </div>
              )}
              <LimitedMarkdown content={result.content ?? ''} />
              {result.cached && <small className="ask-lexora-cached">Cached</small>}
              <button
                type="button"
                className="ask-lexora-new"
                onClick={resetToMenu}
              >
                Try another action
              </button>
            </div>
          )}

          {!collapsed && phase === 'done' && result === null && message && (
            <div className="ask-lexora-message" aria-live="polite">
              <p>{message}</p>
              <button
                type="button"
                className="ask-lexora-new"
                onClick={resetToMenu}
              >
                Try another action
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
