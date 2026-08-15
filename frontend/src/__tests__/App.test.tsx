// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { writePageRotation } from '../state/pageRotation';

// Keep pdf.js inert in jsdom: no worker, no canvas, no document loading.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: new Promise(() => {}),
    destroy: vi.fn(),
  })),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fakePdfFile(): File {
  return new File(['fake pdf bytes'], 'buch.pdf', { type: 'application/pdf' });
}

function readyPage(pageNumber: number, blankId = `blank-${pageNumber}`) {
  return {
    id: `page-${pageNumber}`,
    bookId: 'book-a',
    pageNumber,
    processingStatus: 'READY',
    failureReason: null,
    analysis: JSON.stringify({
      schemaVersion: '0.2.0', pageNumber, width: 1200, height: 1600, language: 'de',
      textSpans: [{ id: `prompt-${pageNumber}`, text: `Lesson page ${pageNumber} has enough source context for this exercise.`, confidence: 0.99, confidenceScope: 'line', bbox: { x: 0.1, y: 0.2, width: 0.6, height: 0.03 } }],
      exerciseBlanks: [{ id: blankId, kind: 'fill-in-line', lineBbox: { x: 0.3, y: 0.3, width: 0.2, height: 0.002 }, interactionBbox: { x: 0.3, y: 0.28, width: 0.2, height: 0.03 }, detectionMethod: 'horizontal-line-v1', candidateScore: 0.95, nearbyTextSpanIds: [`prompt-${pageNumber}`] }],
      blankDetection: null, choiceGroups: [], choiceTargets: [], choiceDetection: null,
      choiceGrids: [], choiceGridDetection: null, sentenceOrderings: [], sentenceOrderingDetection: null,
      matchingInteractions: [], matchingDetection: null, freeTextInteractions: [], freeTextDetection: null,
      processor: { engine: 'test', processedAt: '2026-08-10T00:00:00Z' },
    }),
  };
}

function answerKey() {
  return {
    extractionMethod: 'test', parserVersion: '1', sourcePageRange: '1-2',
    extractionStatus: 'READY', failureReason: null, extractedAt: '2026-08-10T00:00:00Z', entryCount: 2, entries: [],
  };
}

function correction(pageNumber: number, resolution: 'RESOLVED' | 'AMBIGUOUS' | 'UNMAPPED' = 'RESOLVED') {
  return {
    bookId: 'book-a', pageNumber, unitNumber: pageNumber, unitTitle: `Unit ${pageNumber}`, status: resolution,
    slots: [{
      interactionKind: 'fill-in-line', ordinal: 0, resolution,
      entry: resolution === 'RESOLVED' ? {
        pageNumber, interactionKind: 'fill-in-line', ordinal: 0, expectedValue: `answer-${pageNumber}`,
        alternatives: [], caseSensitive: false, punctuationRequired: false, normalizationMode: 'strict',
        rawSolutionText: `answer-${pageNumber}`, confidence: 1, mappingWarnings: [],
      } : null,
    }],
  };
}

function pageInput(): HTMLInputElement {
  return document.querySelector('input.page-input') as HTMLInputElement;
}

function uploadInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('curated public demo entry', () => {
  it('opens the synthetic workbook without exposing upload or analysis actions', async () => {
    window.history.replaceState({}, '', '/demo');

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/public-demo') {
        return Promise.resolve(jsonResponse({ bookId: 'book-a', pageCount: 3 }));
      }
      if (url === '/api/books/book-a') {
        return Promise.resolve(jsonResponse({ id: 'book-a', pageCount: 3 }));
      }
      if (url === '/api/books/book-a/pages/1') {
        return Promise.resolve(jsonResponse(readyPage(1)));
      }
      if (url === '/api/books/book-a/answer-key') {
        return Promise.resolve(jsonResponse(answerKey()));
      }
      if (url === '/api/books/book-a/pages/1/correction') {
        return Promise.resolve(jsonResponse(correction(1)));
      }
      return Promise.reject(new Error(`Unexpected fetch: GET ${url}`));
    }));

    render(<App />);

    await waitFor(() => expect(pageInput().max).toBe('3'));
    expect(localStorage.getItem('lexora.currentBookId')).toBe('book-a');
    expect(screen.queryByText('Upload PDF')).toBeNull();
    expect(screen.queryByRole('button', { name: /process/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Classic' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Interactive' })).toBeTruthy();
  });

  it('never falls through to a private stored book when the public demo is unavailable', async () => {
    window.history.replaceState({}, '', '/demo');
    localStorage.setItem('lexora.currentBookId', 'private-book');
    const requested: string[] = [];

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url === '/api/public-demo') return Promise.resolve(jsonResponse({}, 404));
      if (url === '/api/ai/assist/config') return Promise.resolve(jsonResponse({ enabled: false, siteKey: null }));
      return Promise.reject(new Error(`Unexpected fetch: GET ${url}`));
    }));

    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Public demo unavailable' })).toBeTruthy());
    expect(requested).not.toContain('/api/books/private-book');
    expect(screen.queryByText('Upload PDF')).toBeNull();
    expect(localStorage.getItem('lexora.currentBookId')).toBeNull();
  });
});

describe('document selection races', () => {
  it('lets a newer upload win over a still-running restoration', async () => {
    localStorage.setItem('lexora.currentBookId', 'book-old');
    localStorage.setItem('lexora.currentPage', '2');

    const bookOldReq = deferred<Response>();
    const sourceOldReq = deferred<Response>();
    const pagesOldReq = deferred<Response>();
    const uploadReq = deferred<Response>();
    const pagesNewReq = deferred<Response>();

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url === '/api/books') return uploadReq.promise;
      if (url === '/api/books/book-old') return bookOldReq.promise;
      if (url === '/api/books/book-old/source') return sourceOldReq.promise;
      if (url === '/api/books/book-old/pages') return pagesOldReq.promise;
      if (url === '/api/books/book-new/pages') return pagesNewReq.promise;
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    }));

    render(<App />);

    expect(screen.getByLabelText(/restoring/i)).toBeTruthy();

    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    await act(async () => {
      uploadReq.resolve(jsonResponse({ id: 'book-new', pageCount: 10 }, 201));
    });

    await waitFor(() => expect(localStorage.getItem('lexora.currentBookId')).toBe('book-new'));
    expect(pageInput().max).toBe('10');

    // The stale restoration resolves after the upload; it must not win.
    await act(async () => {
      bookOldReq.resolve(jsonResponse({ id: 'book-old', pageCount: 5 }));
      sourceOldReq.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      pagesOldReq.resolve(jsonResponse([]));
    });

    expect(localStorage.getItem('lexora.currentBookId')).toBe('book-new');
    expect(pageInput().max).toBe('10');
    expect(pageInput().value).toBe('1');
  });

  it('does not let a stale restoration failure evict a freshly uploaded book', async () => {
    localStorage.setItem('lexora.currentBookId', 'book-old');

    const bookOldReq = deferred<Response>();
    const uploadReq = deferred<Response>();
    const pagesNewReq = deferred<Response>();

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url === '/api/books') return uploadReq.promise;
      if (url === '/api/books/book-old') return bookOldReq.promise;
      if (url === '/api/books/book-old/source') return Promise.reject(new Error('pending'));
      if (url === '/api/books/book-old/pages') return Promise.reject(new Error('pending'));
      if (url === '/api/books/book-new/pages') return pagesNewReq.promise;
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    }));

    render(<App />);

    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    await act(async () => {
      uploadReq.resolve(jsonResponse({ id: 'book-new', pageCount: 10 }, 201));
    });
    await waitFor(() => expect(localStorage.getItem('lexora.currentBookId')).toBe('book-new'));

    await act(async () => {
      bookOldReq.reject(new Error('book gone'));
    });

    // The stale failure must not remove the new book or drop back to idle.
    expect(localStorage.getItem('lexora.currentBookId')).toBe('book-new');
    expect(pageInput().max).toBe('10');
  });

  it('keeps the later of two overlapping uploads', async () => {
    const uploadA = deferred<Response>();
    const uploadB = deferred<Response>();
    const pagesB = deferred<Response>();
    let postCount = 0;

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url === '/api/books') {
        postCount += 1;
        return postCount === 1 ? uploadA.promise : uploadB.promise;
      }
      if (url === '/api/books/book-a/pages') return Promise.reject(new Error('superseded'));
      if (url === '/api/books/book-b/pages') return pagesB.promise;
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    }));

    render(<App />);

    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });

    // Second upload completes first and becomes the current book.
    await act(async () => {
      uploadB.resolve(jsonResponse({ id: 'book-b', pageCount: 7 }, 201));
    });
    await waitFor(() => expect(localStorage.getItem('lexora.currentBookId')).toBe('book-b'));
    expect(pageInput().max).toBe('7');

    // The first upload completes late; it must not overwrite book-b.
    await act(async () => {
      uploadA.resolve(jsonResponse({ id: 'book-a', pageCount: 5 }, 201));
    });

    expect(localStorage.getItem('lexora.currentBookId')).toBe('book-b');
    expect(pageInput().max).toBe('7');
  });
});

describe('navigation state identity', () => {
  function uploadReadyBook(): Deferred<Response> {
    const uploadReq = deferred<Response>();
    const pagesReq = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url === '/api/books') return uploadReq.promise;
      if (url === '/api/books/book-a/pages/1') return pagesReq.promise;
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    }));
    return uploadReq;
  }

  it('applies the target page rotation immediately on navigation', async () => {
    const uploadReq = uploadReadyBook();
    render(<App />);

    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    await act(async () => {
      uploadReq.resolve(jsonResponse({ id: 'book-a', pageCount: 10 }, 201));
    });
    await waitFor(() => expect(pageInput()).toBeTruthy());

    writePageRotation('book-a', 2, 90);
    fireEvent.change(pageInput(), { target: { value: '2' } });

    // The page resource fetch is still pending, so the canvas draw must never
    // run with the previous page's rotation: 90° is visible immediately.
    expect(document.querySelector('.rotate-degree')?.textContent).toContain('90');
    expect(localStorage.getItem('lexora.currentPage')).toBe('2');
  });

  it('keeps the rotation of an unprocessed page across navigation and back', async () => {
    const uploadReq = uploadReadyBook();
    render(<App />);

    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    await act(async () => {
      uploadReq.resolve(jsonResponse({ id: 'book-a', pageCount: 10 }, 201));
    });
    await waitFor(() => expect(pageInput()).toBeTruthy());

    writePageRotation('book-a', 5, 90);
    fireEvent.change(pageInput(), { target: { value: '5' } });
    expect(document.querySelector('.rotate-degree')?.textContent).toContain('90');

    fireEvent.change(pageInput(), { target: { value: '8' } });
    expect(document.querySelector('.rotate-degree')?.textContent).toContain('0');

    // Page 5 has no resource row: the pages fetch resolves without it, so
    // showPage(null) must not reset the rotation that was preloaded.
    fireEvent.change(pageInput(), { target: { value: '5' } });
    expect(document.querySelector('.rotate-degree')?.textContent).toContain('90');
  });

  it('restores the saved rotation of an unprocessed page after F5', async () => {
    localStorage.setItem('lexora.currentBookId', 'book-old');
    localStorage.setItem('lexora.currentPage', '2');
    writePageRotation('book-old', 2, 270);

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/books/book-old') return Promise.resolve(jsonResponse({ id: 'book-old', pageCount: 5 }));
      if (url === '/api/books/book-old/source') return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      if (url === '/api/books/book-old/pages') return Promise.resolve(jsonResponse([]));
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    }));

    render(<App />);

    await waitFor(() => expect(document.querySelector('.rotate-degree')?.textContent).toContain('270'));
    expect(pageInput().value).toBe('2');
  });

  it('keeps Process available for a page whose resource has not loaded yet', async () => {
    const uploadReq = uploadReadyBook();
    render(<App />);

    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    await act(async () => {
      uploadReq.resolve(jsonResponse({ id: 'book-a', pageCount: 10 }, 201));
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Process' })).toBeTruthy());
    const processButton = screen.getByRole('button', { name: 'Process' }) as HTMLButtonElement;
    expect(processButton.disabled).toBe(false);
  });

  it('keeps the retained analysis visible after a failed Update analysis', async () => {
    const uploadReq = deferred<Response>();
    const pagesReq = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url === '/api/books') return uploadReq.promise;
      if (url === '/api/books/book-a/pages/1') return pagesReq.promise;
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    }));
    render(<App />);

    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    await act(async () => {
      uploadReq.resolve(jsonResponse({ id: 'book-a', pageCount: 10 }, 201));
    });

    const retainedAnalysis = JSON.stringify({
      schemaVersion: '0.2.0',
      pageNumber: 1,
      width: 1200,
      height: 1600,
      language: 'de',
      textSpans: [],
      exerciseBlanks: [{
        id: 'blank-1',
        kind: 'fill-in-line',
        lineBbox: { x: 0.2, y: 0.3, width: 0.1, height: 0.001 },
        interactionBbox: { x: 0.2, y: 0.29, width: 0.1, height: 0.018 },
        detectionMethod: 'horizontal-line-v1',
        candidateScore: 0.9,
        nearbyTextSpanIds: [],
      }],
      blankDetection: {},
      choiceGroups: [],
      choiceTargets: [],
      choiceDetection: {},
      choiceGrids: [],
      choiceGridDetection: {},
      sentenceOrderings: [],
      sentenceOrderingDetection: {},
      processor: {},
    });
    await act(async () => {
      pagesReq.resolve(jsonResponse({
        id: 'page-1',
        bookId: 'book-a',
        pageNumber: 1,
        processingStatus: 'FAILED',
        analysis: retainedAnalysis,
        failureReason: 'OCR unavailable',
      }));
    });

    await waitFor(() => expect(document.querySelector('.blank-input')).toBeTruthy());
    expect(screen.getByText(/Failed\. Retry is available/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('request recovery and correction isolation', () => {
  it('recovers from an upload network failure instead of remaining busy', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    render(<App />);
    fireEvent.change(uploadInput(), { target: { files: [fakePdfFile()] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be uploaded/i);
    expect(screen.queryByText('Uploading...')).toBeNull();
  });

  it('shows retryable page and correction request errors', async () => {
    localStorage.setItem('lexora.currentBookId', 'book-a');
    localStorage.setItem('lexora.currentPage', '1');
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
    let pageAttempts = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/books/book-a') return Promise.resolve(jsonResponse({ id: 'book-a', pageCount: 2 }));
      if (url === '/api/books/book-a/pages/1') {
        pageAttempts += 1;
        return pageAttempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(jsonResponse(readyPage(1)));
      }
      if (url === '/api/books/book-a/answer-key') return Promise.resolve(jsonResponse(answerKey()));
      if (url === '/api/books/book-a/pages/1/correction') return Promise.reject(new Error('offline'));
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry page' }));
    expect(await screen.findByRole('textbox', { name: /answer for/i })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Correction unavailable. Retry' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check answers' })).toBeNull();
  });

  it('clears old correction authority before navigating to a new page', async () => {
    localStorage.setItem('lexora.currentBookId', 'book-a');
    localStorage.setItem('lexora.currentPage', '1');
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
    const pageTwoCorrection = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/books/book-a') return Promise.resolve(jsonResponse({ id: 'book-a', pageCount: 2 }));
      if (url === '/api/books/book-a/pages/1') return Promise.resolve(jsonResponse(readyPage(1)));
      if (url === '/api/books/book-a/pages/2') return Promise.resolve(jsonResponse(readyPage(2)));
      if (url === '/api/books/book-a/answer-key') return Promise.resolve(jsonResponse(answerKey()));
      if (url === '/api/books/book-a/pages/1/correction') return Promise.resolve(jsonResponse(correction(1)));
      if (url === '/api/books/book-a/pages/2/correction') return pageTwoCorrection.promise;
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }));

    render(<App />);
    fireEvent.change(await screen.findByRole('textbox', { name: /answer for/i }), { target: { value: 'answer' } });
    expect((await screen.findByRole('button', { name: 'Check answers' }) as HTMLButtonElement).disabled).toBe(false);
    const nextPage = screen.getByRole('button', { name: 'Next Page' });
    fireEvent.mouseDown(nextPage);
    fireEvent.mouseUp(nextPage);
    await waitFor(() => expect(pageInput().value).toBe('2'));
    fireEvent.change(await screen.findByRole('textbox', { name: /answer for/i }), { target: { value: 'answer' } });
    expect(screen.queryByRole('button', { name: 'Check answers' })).toBeNull();

    await act(async () => pageTwoCorrection.resolve(jsonResponse(correction(2))));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Check answers' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('preserves an AMBIGUOUS backend slot through the App correction flow', async () => {
    localStorage.setItem('lexora.currentBookId', 'book-a');
    localStorage.setItem('lexora.currentPage', '1');
    localStorage.setItem('lexora.readerMode.v1', 'interactive');
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/books/book-a') return Promise.resolve(jsonResponse({ id: 'book-a', pageCount: 1 }));
      if (url === '/api/books/book-a/pages/1') return Promise.resolve(jsonResponse(readyPage(1)));
      if (url === '/api/books/book-a/answer-key') return Promise.resolve(jsonResponse(answerKey()));
      if (url === '/api/books/book-a/pages/1/correction') return Promise.resolve(jsonResponse(correction(1, 'AMBIGUOUS')));
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }));

    render(<App />);
    fireEvent.change(await screen.findByRole('textbox', { name: /answer for/i }), { target: { value: 'answer' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Check answers' }));
    expect(await screen.findByText(/source answer needs review/i)).toBeTruthy();
    expect(screen.queryByText('Correct')).toBeNull();
  });
});
