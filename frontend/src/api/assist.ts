export type AssistAction = 'hint' | 'explain' | 'translate' | 'check' | 'ask';

export type AssistStatus =
  | 'success'
  | 'disabled'
  | 'verification_required'
  | 'limit_reached'
  | 'unavailable'
  | 'not_applicable'
  | 'invalid_context';

export type AssistVerdict = 'likely_correct' | 'likely_incorrect' | 'uncertain';

export interface AssistConfig {
  enabled: boolean;
  siteKey: string | null;
  sessionQuota: SessionQuota | null;
}

export interface SessionQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface AssistRequestPayload {
  action: AssistAction;
  bookId: string;
  pageNumber: number;
  exerciseId: string | null;
  answer: string | null;
  targetLanguage: string | null;
  question?: string | null;
  selection?: SelectionRect | null;
  turnstileToken: string | null;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AssistResponse {
  action: AssistAction;
  status: AssistStatus;
  content: string | null;
  verdict: AssistVerdict | null;
  cached: boolean;
  siteKey: string | null;
  message: string | null;
  sessionQuota: SessionQuota | null;
}

/**
 * The compact descriptor of the exercise Ask Lexora should act on. It is
 * derived in the reader from the current/selected interaction; the backend
 * reconstructs the canonical context from the exerciseId alone.
 */
export interface ExerciseContext {
  exerciseId: string;
  /** Canonical source identity when answer storage uses a child id. */
  assistExerciseId?: string;
  kind: string;
  answer: string | null;
  canCheck: boolean;
}

export async function fetchAssistConfig(signal?: AbortSignal): Promise<AssistConfig> {
  const res = await fetch('/api/ai/assist/config', { signal });
  if (!res.ok) return { enabled: false, siteKey: null, sessionQuota: null };
  const payload = await res.json() as Partial<AssistConfig>;
  return {
    enabled: payload.enabled === true,
    siteKey: payload.siteKey ?? null,
    sessionQuota: normalizeQuota(payload.sessionQuota),
  };
}

export async function requestAssist(
  payload: AssistRequestPayload,
  signal?: AbortSignal,
): Promise<AssistResponse> {
  const res = await fetch('/api/ai/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      question: payload.question ?? null,
      selection: payload.selection ?? null,
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`AI assistance failed: ${res.status}`);
  }
  const responsePayload = await res.json() as AssistResponse;
  return { ...responsePayload, sessionQuota: normalizeQuota(responsePayload.sessionQuota) };
}

function normalizeQuota(value: unknown): SessionQuota | null {
  if (!value || typeof value !== 'object') return null;
  const quota = value as Partial<SessionQuota>;
  if (![quota.used, quota.limit, quota.remaining].every((item) => typeof item === 'number' && Number.isFinite(item))) {
    return null;
  }
  return {
    used: Math.max(0, quota.used!),
    limit: Math.max(0, quota.limit!),
    remaining: Math.max(0, quota.remaining!),
  };
}
