import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';
import {
  requestAssist,
  type AssistAction,
  type AssistResponse,
  type ExerciseContext,
} from '../api/assist';

type OrbState = 'working' | 'composing' | 'solving';

interface Props {
  bookId: string | null;
  pageNumber: number;
  exercise: ExerciseContext | null;
  siteKey: string | null;
}

type Phase = 'idle' | 'working' | 'verifying' | 'done';

interface PendingPayload {
  action: AssistAction;
  targetLanguage: string | null;
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TURNSTILE_CALLBACK = '__lexoraTurnstile';

const VERDICT_LABEL: Record<string, string> = {
  likely_correct: 'Likely correct',
  likely_incorrect: 'Likely incorrect',
  uncertain: 'Uncertain',
};

function orbStateFor(action: AssistAction): OrbState {
  if (action === 'check') return 'solving';
  if (action === 'hint') return 'working';
  return 'composing';
}

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
      return 'This exercise could not be matched to its source.';
    default:
      return 'AI help is temporarily unavailable. Please try again.';
  }
}

export default function AskLexora({ bookId, pageNumber, exercise, siteKey }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeAction, setActiveAction] = useState<AssistAction | null>(null);
  const [result, setResult] = useState<AssistResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRef = useRef<PendingPayload | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const runAction = useCallback(async (
    action: AssistAction,
    targetLanguage: string | null,
    turnstileToken: string | null,
  ) => {
    if (!bookId || !exercise) return;
    setPhase('working');
    setActiveAction(action);
    setResult(null);
    setMessage(null);
    pendingRef.current = { action, targetLanguage };
    try {
      const response = await requestAssist({
        action,
        bookId,
        pageNumber,
        exerciseId: exercise.exerciseId,
        answer: action === 'check' ? exercise.answer : null,
        targetLanguage,
        turnstileToken,
      });
      if (response.status === 'verification_required') {
        setPhase('verifying');
        return;
      }
      if (response.status === 'success') {
        setResult(response);
        setPhase('done');
        return;
      }
      setMessage(statusMessage(response));
      setPhase('done');
    } catch {
      setMessage('AI help is temporarily unavailable. Please try again.');
      setPhase('done');
    }
  }, [bookId, pageNumber, exercise]);

  const onTurnstileToken = useCallback((token: string) => {
    const pending = pendingRef.current;
    if (!pending) return;
    void runAction(pending.action, pending.targetLanguage, token);
  }, [runAction]);

  useEffect(() => {
    if (phase !== 'verifying' || !siteKey) return;
    (window as unknown as Record<string, unknown>)[TURNSTILE_CALLBACK] = onTurnstileToken;
    const existing = document.querySelector(
      `script[src="${TURNSTILE_SCRIPT}"]`,
    );
    if (!existing) {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    return () => {
      delete (window as unknown as Record<string, unknown>)[TURNSTILE_CALLBACK];
    };
  }, [phase, siteKey, onTurnstileToken]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        setPhase('idle');
        setResult(null);
        setMessage(null);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const openPanel = () => {
    setOpen(true);
    setPhase('idle');
    setResult(null);
    setMessage(null);
  };

  const hasContext = Boolean(bookId && exercise);
  const canCheck = Boolean(exercise?.canCheck && exercise.answer);

  const items: Array<{ action: AssistAction; label: string; target?: string }> = [
    { action: 'hint', label: 'Hint' },
    { action: 'explain', label: 'Explain' },
    { action: 'translate', label: 'Translate to English', target: 'en' },
    { action: 'translate', label: 'Translate to Spanish', target: 'es' },
    ...(canCheck ? [{ action: 'check' as AssistAction, label: 'Check with AI' }] : []),
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
        title={hasContext ? 'Ask Lexora for contextual AI help' : 'Select an exercise first'}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <Sparkles size={15} aria-hidden="true" />
        <span>Ask Lexora</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="ask-lexora-panel"
          role="dialog"
          aria-label="Ask Lexora"
          tabIndex={-1}
        >
          <div className="ask-lexora-head">
            <span>Ask Lexora</span>
            <button
              type="button"
              className="ask-lexora-close"
              aria-label="Close Ask Lexora"
              onClick={() => {
                setOpen(false);
                setPhase('idle');
                setResult(null);
                setMessage(null);
                triggerRef.current?.focus();
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {phase === 'working' && (
            <div className="ask-lexora-working" role="status">
              <ThinkingOrb state={orbStateFor(activeAction ?? 'hint')} size={20} />
              <span>{activeAction === 'check' ? 'Reviewing your answer…' : 'Thinking…'}</span>
            </div>
          )}

          {phase === 'verifying' && (
            <div className="ask-lexora-verifying" role="status">
              <p>Quickly verify you're human to continue.</p>
              {siteKey && (
                <div
                  ref={turnstileRef}
                  className="cf-turnstile"
                  data-sitekey={siteKey}
                  data-callback={TURNSTILE_CALLBACK}
                />
              )}
            </div>
          )}

          {(phase === 'idle' || phase === 'done') && result === null && !message && (
            <div className="ask-lexora-menu" role="group" aria-label="AI help actions">
              {items.map((item) => (
                <button
                  key={`${item.action}:${item.target ?? ''}`}
                  type="button"
                  className="ask-lexora-action"
                  onClick={() => void runAction(item.action, item.target ?? null, null)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {phase === 'done' && result !== null && (
            <div className="ask-lexora-result" aria-live="polite">
              {result.action === 'check' && result.verdict && (
                <div className="ask-lexora-verdict" data-verdict={result.verdict}>
                  <span>{VERDICT_LABEL[result.verdict] ?? result.verdict}</span>
                  <small>AI-assisted review · not source-backed</small>
                </div>
              )}
              <p className="ask-lexora-content">{result.content}</p>
              {result.cached && <small className="ask-lexora-cached">Cached</small>}
              <button
                type="button"
                className="ask-lexora-new"
                onClick={() => {
                  setPhase('idle');
                  setResult(null);
                  setMessage(null);
                }}
              >
                Try another action
              </button>
            </div>
          )}

          {phase === 'done' && result === null && message && (
            <div className="ask-lexora-message" aria-live="polite">
              <p>{message}</p>
              <button
                type="button"
                className="ask-lexora-new"
                onClick={() => {
                  setPhase('idle');
                  setMessage(null);
                }}
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
