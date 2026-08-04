import { useState, useCallback, useEffect, useRef } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import PageViewer from './reader/PageViewer';
import DebugPanel from './reader/DebugPanel';
import type { ChoiceGrid, ChoiceTarget, ExerciseBlank, TextSpan } from './reader/types';
import {
  emptyPageInteractionState,
  indexChoiceGroups,
  sortChoiceGrids,
  sortChoiceTargets,
  sortExerciseBlanks,
  type PageInteractionState,
} from './reader/overlay';
import { isProcessingStage, processLabel, resolveProcessControl } from './reader/processing';
import { ZOOM_OPTIONS } from './reader/zoom';
import {
  getPageProcessAction,
  getBookPages,
  processBookPage,
  type BookPageResource,
} from './api/client';
import { readBooleanPreference, writeBooleanPreference } from './state/preferences';
import { readPageRotation, writePageRotation } from './state/pageRotation';
import { rotateLeft, rotateRight, type PageRotation } from './reader/rotation';
import { readAnswersForPage, writeAnswersForPage } from './state/exerciseAnswers';

type Status = 'idle' | 'restoring' | 'uploading' | 'ready';

interface BookInfo {
  id: string;
  pageCount: number;
}

interface PendingPersist {
  bookId: string;
  pageNumber: number;
  answers: Record<string, string>;
  blanks: ExerciseBlank[];
  choices: ChoiceTarget[];
  grids: ChoiceGrid[];
  schemaVersion: string;
}

const CURRENT_BOOK_KEY = 'lexora.currentBookId';
const CURRENT_PAGE_KEY = 'lexora.currentPage';
const SHOW_BOXES_KEY = 'lexora.showOcrBoxes';
const SHOW_BLANK_DETECTION_KEY = 'lexora.showBlankDetection';
const SHOW_CHOICE_DETECTION_KEY = 'lexora.showChoiceDetection';
const SHOW_GRID_DETECTION_KEY = 'lexora.showGridDetection';

export default function App() {
  const [status, setStatus] = useState<Status>(() => (
    localStorage.getItem(CURRENT_BOOK_KEY) ? 'restoring' : 'idle'
  ));
  const [book, setBook] = useState<BookInfo | null>(null);
  const [selectedPage, setSelectedPage] = useState(() => {
    const storedPage = Number(localStorage.getItem(CURRENT_PAGE_KEY));
    return storedPage > 0 ? storedPage : 1;
  });
  const [page, setPage] = useState<BookPageResource | null>(null);
  const [processingRequested, setProcessingRequested] = useState(false);
  const [interaction, setInteraction] = useState<PageInteractionState>(emptyPageInteractionState);
  const [showBoxes, setShowBoxes] = useState(() => (
    readBooleanPreference(SHOW_BOXES_KEY, false)
  ));
  const [showBlankDetection, setShowBlankDetection] = useState(() => (
    readBooleanPreference(SHOW_BLANK_DETECTION_KEY, false)
  ));
  const [showChoiceDetection, setShowChoiceDetection] = useState(() => (
    readBooleanPreference(SHOW_CHOICE_DETECTION_KEY, false)
  ));
  const [showGridDetection, setShowGridDetection] = useState(() => (
    readBooleanPreference(SHOW_GRID_DETECTION_KEY, false)
  ));
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState<PageRotation>(0);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const activePage = useRef(selectedPage);
  const processingAbort = useRef<AbortController | null>(null);
  const bookIdRef = useRef<string | null>(null);
  const persistTimer = useRef<number | null>(null);
  const pendingPersist = useRef<PendingPersist | null>(null);
  activePage.current = selectedPage;

  useEffect(() => {
    bookIdRef.current = book?.id ?? null;
  }, [book]);

  const flushPendingAnswers = useCallback(() => {
    if (persistTimer.current) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const pending = pendingPersist.current;
    if (!pending) return;
    pendingPersist.current = null;
    writeAnswersForPage(
      pending.bookId,
      pending.pageNumber,
      pending.answers,
      pending.blanks,
      pending.choices,
      pending.grids,
      pending.schemaVersion,
    );
  }, []);

  const scheduleAnswerPersist = useCallback((pending: PendingPersist) => {
    pendingPersist.current = pending;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(flushPendingAnswers, 250);
  }, [flushPendingAnswers]);

  useEffect(() => {
    window.addEventListener('beforeunload', flushPendingAnswers);
    return () => {
      window.removeEventListener('beforeunload', flushPendingAnswers);
      flushPendingAnswers();
    };
  }, [flushPendingAnswers]);

  const showPage = useCallback((nextPage: BookPageResource | null, bookId: string) => {
    setPage(nextPage);
    setRotation(nextPage ? readPageRotation(bookId, nextPage.pageNumber) : 0);
    const analysis = nextPage?.processingStatus === 'READY'
      ? nextPage.analysis
      : null;
    const blanks = sortExerciseBlanks(analysis?.exerciseBlanks ?? []);
    const choices = sortChoiceTargets(analysis?.choiceTargets ?? []);
    const choiceGroups = indexChoiceGroups(analysis?.choiceGroups ?? []);
    const grids = sortChoiceGrids(analysis?.choiceGrids ?? []);
    const schemaVersion = analysis?.schemaVersion ?? '';
    const restoredAnswers = nextPage && analysis
      ? readAnswersForPage(bookId, nextPage.pageNumber, blanks, choices, grids, schemaVersion)
      : {};
    setInteraction({
      spans: analysis?.textSpans ?? [],
      blanks,
      choices,
      choiceGroups,
      grids,
      answers: restoredAnswers,
      schemaVersion,
      selectedSpan: null,
      selectedBlank: null,
      selectedChoice: null,
    });
  }, []);

  const clearPageInteraction = useCallback(() => {
    setPage(null);
    setInteraction(emptyPageInteractionState());
  }, []);

  const selectPage = useCallback((nextPage: number) => {
    if (nextPage === activePage.current) return;
    processingAbort.current?.abort();
    setProcessingRequested(false);
    flushPendingAnswers();
    clearPageInteraction();
    setSelectedPage(nextPage);
    localStorage.setItem(CURRENT_PAGE_KEY, String(nextPage));
  }, [clearPageInteraction, flushPendingAnswers]);

  useEffect(() => {
    const bookId = localStorage.getItem(CURRENT_BOOK_KEY);
    if (!bookId) return;

    const restore = async () => {
      setStatus('restoring');
      try {
        const [bookRes, sourceRes, pages] = await Promise.all([
          fetch(`/api/books/${bookId}`),
          fetch(`/api/books/${bookId}/source`),
          getBookPages(bookId),
        ]);
        if (!bookRes.ok || !sourceRes.ok) throw new Error('Stored book is unavailable');

        const storedBook: BookInfo = await bookRes.json();
        const restoredPage = Math.min(selectedPage, storedBook.pageCount);
        setSelectedPage(restoredPage);
        localStorage.setItem(CURRENT_PAGE_KEY, String(restoredPage));
        setBook(storedBook);
        setPdfData(await sourceRes.arrayBuffer());
        showPage(pages.find((candidate) => candidate.pageNumber === restoredPage) ?? null, storedBook.id);
        setStatus('ready');
      } catch (error) {
        localStorage.removeItem(CURRENT_BOOK_KEY);
        setStatus('idle');
        console.error('Restore failed:', error);
      }
    };

    void restore();
  }, []);

  useEffect(() => {
    if (!book || status === 'restoring') return;

    const controller = new AbortController();
    clearPageInteraction();

    void getBookPages(book.id, controller.signal)
      .then((pages) => {
        const persisted = pages.find((candidate) => candidate.pageNumber === selectedPage);
        showPage(persisted ?? null, book.id);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Page loading failed:', error);
      });

    return () => controller.abort();
  }, [book, selectedPage, status, showPage, clearPageInteraction]);

  const handleUpload = useCallback(async (file: File) => {
    setStatus('uploading');
    setRotation(0);
    const form = new FormData();
    form.append('file', file);
    form.append('language', 'de');

    const res = await fetch('/api/books', { method: 'POST', body: form });
    if (!res.ok) {
      setStatus('idle');
      console.error('Upload failed:', res.status);
      return;
    }
    const info: BookInfo = await res.json();
    if (!info?.id) {
      setStatus('idle');
      console.error('Upload returned invalid book info');
      return;
    }

    flushPendingAnswers();
    setBook(info);
    clearPageInteraction();
    setSelectedPage(1);
    localStorage.setItem(CURRENT_BOOK_KEY, info.id);
    localStorage.setItem(CURRENT_PAGE_KEY, '1');
    setPdfData(await file.arrayBuffer());
    setStatus('ready');
  }, [clearPageInteraction, flushPendingAnswers]);

  const handleProcessPage = useCallback(async () => {
    if (!book) return;

    const processAction = getPageProcessAction(page);
    if (processAction === 'none') return;

    const bookId = book.id;
    const pageNumber = selectedPage;
    const controller = new AbortController();
    processingAbort.current?.abort();
    processingAbort.current = controller;
    setProcessingRequested(true);
    flushPendingAnswers();
    setInteraction(emptyPageInteractionState());

    const poll = window.setInterval(() => {
      void getBookPages(bookId, controller.signal).then((pages) => {
        if (activePage.current !== pageNumber) return;
        const current = pages.find((candidate) => candidate.pageNumber === pageNumber);
        if (current) showPage(current, bookId);
      }).catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') {
          console.error('Page polling failed:', error);
        }
      });
    }, 250);

    try {
      const result = await processBookPage(
        bookId,
        pageNumber,
        processAction === 'update',
        controller.signal,
      );
      if (activePage.current === pageNumber) showPage(result, bookId);
    } catch (error: unknown) {
      if ((error as { name?: string }).name !== 'AbortError') {
        console.error('Processing failed:', error);
      }
    } finally {
      window.clearInterval(poll);
      if (processingAbort.current === controller) processingAbort.current = null;
      if (activePage.current === pageNumber) setProcessingRequested(false);
    }
  }, [book, page, selectedPage, showPage, flushPendingAnswers]);

  const handleSpanClick = useCallback((span: TextSpan) => {
    setInteraction((current) => ({
      ...current,
      selectedSpan: span,
      selectedBlank: null,
    }));
  }, []);

  const handleBlankClick = useCallback((blank: ExerciseBlank) => {
    setInteraction((current) => ({
      ...current,
      selectedSpan: null,
      selectedBlank: blank,
      selectedChoice: null,
    }));
  }, []);

  const handleChoiceClick = useCallback((choice: ChoiceTarget) => {
    setInteraction((current) => ({
      ...current,
      selectedSpan: null,
      selectedBlank: null,
      selectedChoice: choice,
    }));
  }, []);

  const handleChoiceClose = useCallback(() => {
    setInteraction((current) => ({ ...current, selectedChoice: null }));
  }, []);

  const handleChoiceSelect = useCallback((choiceId: string, optionId: string) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const answers = { ...interaction.answers, [choiceId]: optionId };
    setInteraction((current) => ({
      ...current,
      answers,
      selectedChoice: null,
    }));
    scheduleAnswerPersist({
      bookId,
      pageNumber: activePage.current,
      answers,
      blanks: interaction.blanks,
      choices: interaction.choices,
      grids: interaction.grids,
      schemaVersion: interaction.schemaVersion,
    });
  }, [interaction, scheduleAnswerPersist]);

  const handleGridSelect = useCallback((rowId: string, optionId: string) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const answers = { ...interaction.answers, [rowId]: optionId };
    setInteraction((current) => ({ ...current, answers }));
    scheduleAnswerPersist({
      bookId,
      pageNumber: activePage.current,
      answers,
      blanks: interaction.blanks,
      choices: interaction.choices,
      grids: interaction.grids,
      schemaVersion: interaction.schemaVersion,
    });
  }, [interaction, scheduleAnswerPersist]);

  const handleAnswerChange = useCallback((blankId: string, value: string) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const answers = { ...interaction.answers, [blankId]: value };
    setInteraction((current) => ({ ...current, answers }));
    scheduleAnswerPersist({
      bookId,
      pageNumber: activePage.current,
      answers,
      blanks: interaction.blanks,
      choices: interaction.choices,
      grids: interaction.grids,
      schemaVersion: interaction.schemaVersion,
    });
  }, [interaction, scheduleAnswerPersist]);

  const handleRotateLeft = useCallback(() => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const next = rotateLeft(rotation);
    setRotation(next);
    writePageRotation(bookId, activePage.current, next);
  }, [rotation]);

  const handleRotateRight = useCallback(() => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const next = rotateRight(rotation);
    setRotation(next);
    writePageRotation(bookId, activePage.current, next);
  }, [rotation]);

  const pageStage = page?.processingStatus
    ?? (processingRequested ? 'PENDING' : null);
  const processing = isProcessingStage(pageStage);
  const processControl = resolveProcessControl(pageStage, getPageProcessAction(page));
  const processButtonLabel = processLabel(processControl);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Lexora PoC 1</h1>
        <div className="toolbar-controls">
          <label className="upload-btn">
            Upload PDF
            <input
              type="file"
              accept=".pdf"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
          </label>

          {book && (
            <>
              <span className="page-info">
                Page
                <input
                  type="number"
                  min={1}
                  max={book.pageCount}
                  value={selectedPage}
                  onChange={(event) => {
                    const nextPage = Math.max(1, Math.min(book.pageCount, Number(event.target.value)));
                    selectPage(nextPage);
                  }}
                  className="page-input"
                />
                / {book.pageCount}
              </span>
              <button
                onClick={() => void handleProcessPage()}
                disabled={processControl === 'none' || processControl === 'processed' || processing}
              >
                {processButtonLabel}
              </button>
            </>
          )}

          <select
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="zoom-select"
          >
            {ZOOM_OPTIONS.map((option) => (
              <option key={option} value={option}>{Math.round(option * 100)}%</option>
            ))}
          </select>

          {book && (
            <div className="rotate-controls" aria-label="Page rotation">
              <button
                type="button"
                className="rotate-btn"
                aria-label="Rotate page left"
                title="Rotate page left"
                onClick={handleRotateLeft}
              >
                ↺
              </button>
              <span className="rotate-degree" aria-live="polite">
                {rotation}°
              </span>
              <button
                type="button"
                className="rotate-btn"
                aria-label="Rotate page right"
                title="Rotate page right"
                onClick={handleRotateRight}
              >
                ↻
              </button>
            </div>
          )}

          <label className="toggle">
            <input
              type="checkbox"
              checked={showBoxes}
              onChange={(event) => {
                setShowBoxes(event.target.checked);
                writeBooleanPreference(SHOW_BOXES_KEY, event.target.checked);
              }}
            />
            Show OCR boxes
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showBlankDetection}
              onChange={(event) => {
                setShowBlankDetection(event.target.checked);
                writeBooleanPreference(SHOW_BLANK_DETECTION_KEY, event.target.checked);
              }}
            />
            Show blank detection
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showChoiceDetection}
              onChange={(event) => {
                setShowChoiceDetection(event.target.checked);
                writeBooleanPreference(SHOW_CHOICE_DETECTION_KEY, event.target.checked);
              }}
            />
            Show choice detection
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showGridDetection}
              onChange={(event) => {
                setShowGridDetection(event.target.checked);
                writeBooleanPreference(SHOW_GRID_DETECTION_KEY, event.target.checked);
              }}
            />
            Show grid detection
          </label>

          {pageStage === 'FAILED' && (
            <span className="status status-error">Failed. Retry is available.</span>
          )}
          {status === 'uploading' && <span className="status">Uploading...</span>}
        </div>
      </header>

      <main className="reader-layout">
        <div className="page-area">
          {status === 'restoring' ? (
            <div className="restoration-skeleton" aria-label="Restoring PDF">
              <Skeleton width="100%" height="100%" />
            </div>
          ) : pdfData ? (
            <PageViewer
              pdfData={pdfData}
              pageNumber={selectedPage}
              rotation={rotation}
              spans={interaction.spans}
              blanks={interaction.blanks}
              choices={interaction.choices}
              choiceGroups={interaction.choiceGroups}
              grids={interaction.grids}
              answers={interaction.answers}
              zoom={zoom}
              showBoxes={showBoxes}
              showBlankDetection={showBlankDetection}
              showChoiceDetection={showChoiceDetection}
              showGridDetection={showGridDetection}
              selectedChoice={interaction.selectedChoice}
              processingStage={pageStage}
              onSpanClick={handleSpanClick}
              onBlankClick={handleBlankClick}
              onAnswerChange={handleAnswerChange}
              onChoiceClick={handleChoiceClick}
              onChoiceSelect={handleChoiceSelect}
              onChoiceClose={handleChoiceClose}
              onGridSelect={handleGridSelect}
            />
          ) : (
            <div className="empty-state">Upload a scanned PDF to begin</div>
          )}
        </div>
        <DebugPanel
          span={interaction.selectedSpan}
          blank={interaction.selectedBlank}
          choice={interaction.selectedChoice}
        />
      </main>
    </div>
  );
}
