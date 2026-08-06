import { useEffect } from 'react';
import { getBookPage, type BookPageResource } from '../api/client';
import {
  isProcessingStage,
  RECOVERY_POLL_INTERVAL_MS,
  RECOVERY_POLL_MAX_TICKS,
  type ProcessingTarget,
} from './processing';

export interface ProcessingRecoveryOptions {
  enabled: boolean;
  bookId: string | undefined;
  page: BookPageResource | null;
  processingTarget: ProcessingTarget | null;
  getCurrentPageNumber: () => number;
  onPageUpdate: (page: BookPageResource, bookId: string) => void;
}

/**
 * F5 recovery: after a refresh the in-flight browser POST is gone but the
 * backend job may still be running. While the current page has an active
 * stage and no user-initiated request owns it, track its stage to a terminal
 * state with a bounded, read-only poll, so the restored page does not stay
 * stuck in a processing shell after the backend actually finished.
 *
 * Bounds: one interval, self-terminating at RECOVERY_POLL_MAX_TICKS even if
 * a tick's request never settles; cleared on terminal stage and on teardown.
 * Every result is checked against the current page number before applying,
 * so a stale response can never update a page the user already left.
 */
export function useProcessingRecoveryTracker({
  enabled,
  bookId,
  page,
  processingTarget,
  getCurrentPageNumber,
  onPageUpdate,
}: ProcessingRecoveryOptions): void {
  useEffect(() => {
    if (!enabled || !bookId) return;
    if (processingTarget !== null) return;
    if (!page || !isProcessingStage(page.processingStatus)) return;

    const controller = new AbortController();
    let ticks = 0;

    const poll = window.setInterval(() => {
      ticks += 1;
      if (ticks >= RECOVERY_POLL_MAX_TICKS) {
        window.clearInterval(poll);
      }
      const pageNumber = getCurrentPageNumber();
      void getBookPage(bookId, pageNumber, controller.signal)
        .then((current) => {
          if (getCurrentPageNumber() !== pageNumber) return;
          onPageUpdate(current, bookId);
          if (!isProcessingStage(current.processingStatus)) {
            window.clearInterval(poll);
          }
        })
        .catch((error: unknown) => {
          const err = error as { name?: string; status?: number };
          if (err.name === 'AbortError') return;
          if (err.status !== 404) console.error('Page tracking failed:', error);
        });
    }, RECOVERY_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(poll);
      controller.abort();
    };
  }, [enabled, bookId, page?.processingStatus, processingTarget, getCurrentPageNumber, onPageUpdate]);
}
