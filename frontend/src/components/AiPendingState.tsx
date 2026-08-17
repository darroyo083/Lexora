import { useEffect, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import type { AssistAction } from '../api/assist';
import { PROCESSING_MESSAGE_INTERVAL_MS } from '../reader/processing';

type OrbState = 'working' | 'composing' | 'solving';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function orbStateFor(action: AssistAction): OrbState {
  if (action === 'check') return 'solving';
  if (action === 'hint') return 'working';
  return 'composing';
}

function messagesFor(action: AssistAction): string[] {
  if (action === 'check') {
    return ['Reading the context', 'Reviewing your answer', 'Preparing a response'];
  }
  if (action === 'translate') {
    return ['Reading the context', 'Keeping the meaning intact', 'Preparing the translation'];
  }
  return ['Reading the context', 'Understanding the exercise', 'Preparing an answer'];
}

function prefersReducedMotion(): boolean {
  return typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
    || window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export default function AiPendingState({ action }: { action: AssistAction }) {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = messagesFor(action);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    setMessageIndex(0);
    if (reducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, PROCESSING_MESSAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [action, messages.length, reducedMotion]);

  const message = messages[reducedMotion ? 0 : messageIndex] ?? messages[0];
  return (
    <div className="ask-lexora-working" role="status" aria-live="polite" aria-atomic="true">
      <span className="ask-lexora-loading-orb" aria-hidden="true">
        <ThinkingOrb state={orbStateFor(action)} size={20} />
      </span>
      <span key={message} className="ask-lexora-pending-copy">{message}</span>
    </div>
  );
}

export { messagesFor };
