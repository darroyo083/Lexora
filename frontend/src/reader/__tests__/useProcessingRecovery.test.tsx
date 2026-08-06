// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useProcessingRecoveryTracker } from '../useProcessingRecovery';
import {
  RECOVERY_POLL_INTERVAL_MS,
  RECOVERY_POLL_MAX_TICKS,
  type ProcessingTarget,
} from '../processing';
import type { BookPageResource } from '../../api/client';

function resource(stage: string, pageNumber = 5): BookPageResource {
  return {
    id: `page-${pageNumber}`,
    bookId: 'book-1',
    pageNumber,
    processingStatus: stage as BookPageResource['processingStatus'],
    analysis: null,
    failureReason: null,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface Options {
  enabled?: boolean;
  bookId?: string;
  page: BookPageResource | null;
  processingTarget?: ProcessingTarget | null;
  getCurrentPageNumber?: () => number;
  onPageUpdate?: (page: BookPageResource, bookId: string) => void;
}

function renderTracker(options: Options) {
  return renderHook((props: Options) => useProcessingRecoveryTracker({
    enabled: true,
    bookId: 'book-1',
    processingTarget: null,
    getCurrentPageNumber: () => 5,
    onPageUpdate: vi.fn(),
    ...props,
  }), { initialProps: options });
}

const tick = () => act(async () => {
  vi.advanceTimersByTime(RECOVERY_POLL_INTERVAL_MS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('F5 processing recovery tracker', () => {
  it('does not poll when the page has no active stage', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderTracker({ page: resource('READY') });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not poll while a user-initiated request owns processing', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderTracker({
      page: resource('OCR'),
      processingTarget: { bookId: 'book-1', pageNumber: 5 },
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not poll when disabled (book missing or not ready)', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderTracker({ enabled: false, page: resource('OCR') });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches only the current book and page', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => jsonResponse(resource('READY', 5)));
    vi.stubGlobal('fetch', fetchMock);

    renderTracker({ page: resource('OCR'), bookId: 'book-7' });

    await tick();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/books/book-7/pages/5',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('stops polling promptly when the page reaches READY', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => jsonResponse(resource('READY')));
    vi.stubGlobal('fetch', fetchMock);
    const onPageUpdate = vi.fn();

    renderTracker({ page: resource('OCR'), onPageUpdate });

    await tick();
    expect(onPageUpdate).toHaveBeenCalledTimes(1);
    expect(onPageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ processingStatus: 'READY' }),
      'book-1',
    );

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops polling promptly when the page reaches FAILED', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => jsonResponse(resource('FAILED')));
    vi.stubGlobal('fetch', fetchMock);

    renderTracker({ page: resource('OCR') });

    await tick();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('self-terminates at the tick cap while the page stays active', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => jsonResponse(resource('OCR')));
    vi.stubGlobal('fetch', fetchMock);

    renderTracker({ page: resource('OCR') });

    await act(async () => {
      vi.advanceTimersByTime(RECOVERY_POLL_INTERVAL_MS * RECOVERY_POLL_MAX_TICKS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(RECOVERY_POLL_MAX_TICKS);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(RECOVERY_POLL_MAX_TICKS);
  });

  it('self-terminates even when a tick request never settles', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    renderTracker({ page: resource('OCR') });

    await act(async () => {
      vi.advanceTimersByTime(RECOVERY_POLL_INTERVAL_MS * RECOVERY_POLL_MAX_TICKS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(RECOVERY_POLL_MAX_TICKS);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(RECOVERY_POLL_MAX_TICKS);
  });

  it('never applies a response to a page the user already left', async () => {
    vi.useFakeTimers();
    let currentPage = 5;
    const fetchMock = vi.fn(() => jsonResponse(resource('READY', 5)));
    vi.stubGlobal('fetch', fetchMock);
    const onPageUpdate = vi.fn();

    renderTracker({
      page: resource('OCR'),
      getCurrentPageNumber: () => currentPage,
      onPageUpdate,
    });

    await act(async () => {
      vi.advanceTimersByTime(RECOVERY_POLL_INTERVAL_MS);
      currentPage = 9;
    });

    expect(onPageUpdate).not.toHaveBeenCalled();
  });

  it('stops when the page leaves the active stage (navigation away)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => jsonResponse(resource('READY')));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderTracker({ page: resource('OCR') });
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ page: resource('READY') });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight request and stops the interval on unmount', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderTracker({ page: resource('OCR') });
    await tick();
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
