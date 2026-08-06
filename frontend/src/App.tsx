import { useState, useCallback, useEffect, useRef, useReducer } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import PageViewer from './reader/PageViewer';
import DebugPanel from './reader/DebugPanel';
import SentenceOrderingPanel from './reader/SentenceOrderingPanel';
import type { ChoiceGrid, ChoiceTarget, ExerciseBlank, FreeTextInteraction, MatchingInteraction, SentenceOrderingInteraction, TextSpan } from './reader/types';
import {
  emptyPageInteractionState,
  indexChoiceGroups,
  sortChoiceGrids,
  sortChoiceTargets,
  sortExerciseBlanks,
  sortFreeTextInteractions,
  sortMatchingInteractions,
  sortSentenceOrderings,
  type PageInteractionState,
} from './reader/overlay';
import { parseOrderedAnswer, serializeOrderedAnswer, toggleItem } from './reader/ordering';
import {
  matchItems,
  matchingSelectionReducer,
  parseMatchingAnswer,
  serializeMatchingAnswer,
  unmatchItem,
} from './reader/matching';
import { emptyOrderingView, orderingViewReducer } from './reader/floatingOrdering';
import { currentPageStage, isCurrentPageProcessing, isProcessingStage, processLabel, resolveProcessControl, type ProcessingTarget } from './reader/processing';
import { useProcessingRecoveryTracker } from './reader/useProcessingRecovery';
import { ZOOM_OPTIONS } from './reader/zoom';
import {
  getBookPage,
  getBookPages,
  getPageProcessAction,
  processBookPage,
  type BookPageResource,
} from './api/client';
import {
  readBooleanPreference,
  readOrderingModePreference,
  writeBooleanPreference,
  writeOrderingModePreference,
} from './state/preferences';
import { readPageRotation, writePageRotation } from './state/pageRotation';
import { readZoomPreference, writeZoomPreference } from './state/zoom';
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
  sentenceOrderings: SentenceOrderingInteraction[];
  matchings: MatchingInteraction[];
  freeTexts: FreeTextInteraction[];
  schemaVersion: string;
}

const CURRENT_BOOK_KEY = 'lexora.currentBookId';
const CURRENT_PAGE_KEY = 'lexora.currentPage';
const SHOW_BOXES_KEY = 'lexora.showOcrBoxes';
const SHOW_BLANK_DETECTION_KEY = 'lexora.showBlankDetection';
const SHOW_CHOICE_DETECTION_KEY = 'lexora.showChoiceDetection';
const SHOW_GRID_DETECTION_KEY = 'lexora.showGridDetection';
const SHOW_SENTENCE_ORDERING_DETECTION_KEY = 'lexora.showSentenceOrderingDetection';
const SHOW_MATCHING_DETECTION_KEY = 'lexora.showMatchingDetection';
const SHOW_FREE_TEXT_DETECTION_KEY = 'lexora.showFreeTextDetection';

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
  const [processingTarget, setProcessingTarget] = useState<ProcessingTarget | null>(null);
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
  const [showSentenceOrderingDetection, setShowSentenceOrderingDetection] = useState(() => (
    readBooleanPreference(SHOW_SENTENCE_ORDERING_DETECTION_KEY, false)
  ));
  const [showMatchingDetection, setShowMatchingDetection] = useState(() => (
    readBooleanPreference(SHOW_MATCHING_DETECTION_KEY, false)
  ));
  const [showFreeTextDetection, setShowFreeTextDetection] = useState(() => (
    readBooleanPreference(SHOW_FREE_TEXT_DETECTION_KEY, false)
  ));
  const [zoom, setZoom] = useState<number>(() => readZoomPreference());
  const [rotation, setRotation] = useState<PageRotation>(0);
  const [railTab, setRailTab] = useState<'interactions' | 'debug'>('interactions');
  const [orderingActivePrompt, setOrderingActivePrompt] = useState<string | null>(null);
  const [orderingPanelCollapsed, setOrderingPanelCollapsed] = useState(false);
  const [matchingSelection, dispatchMatchingSelection] = useReducer(
    matchingSelectionReducer,
    null,
  );
  const [orderingView, dispatchOrderingView] = useReducer(
    orderingViewReducer,
    undefined,
    () => emptyOrderingView(readOrderingModePreference()),
  );
  const { mode: orderingMode, expandedExerciseId: expandedOrderingExercise, closedExerciseIds: closedOrderingExercises } = orderingView;
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const activePage = useRef(selectedPage);
  const processingInFlight = useRef(false);
  const bookIdRef = useRef<string | null>(null);
  const persistTimer = useRef<number | null>(null);
  const pendingPersist = useRef<PendingPersist | null>(null);
  // Monotonic token for document selection: restoration and uploads are
  // async, and a late completion must never clobber a newer user action.
  const uploadTokenRef = useRef(0);
  activePage.current = selectedPage;

  useEffect(() => {
    bookIdRef.current = book?.id ?? null;
  }, [book]);

  useEffect(() => {
    writeOrderingModePreference(orderingMode);
  }, [orderingMode]);

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
      pending.sentenceOrderings,
      pending.matchings,
      pending.freeTexts,
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
    // A missing page resource (never-processed page) must not reset rotation
    // to 0: the state already holds the current page's saved rotation,
    // preloaded by selectPage/restore before the fetch completed.
    if (nextPage) setRotation(readPageRotation(bookId, nextPage.pageNumber));
    // A failed forced refresh retains the previous analysis server-side
    // (BookPage.markFailed keeps it). Keep it usable on FAILED pages so a
    // failed Update analysis does not blank out the working page.
    const analysis = nextPage && (
      nextPage.processingStatus === 'READY' || nextPage.processingStatus === 'FAILED'
    ) ? nextPage.analysis : null;
    const blanks = sortExerciseBlanks(analysis?.exerciseBlanks ?? []);
    const choices = sortChoiceTargets(analysis?.choiceTargets ?? []);
    const choiceGroups = indexChoiceGroups(analysis?.choiceGroups ?? []);
    const grids = sortChoiceGrids(analysis?.choiceGrids ?? []);
    const sentenceOrderings = sortSentenceOrderings(analysis?.sentenceOrderings ?? []);
    const matchings = sortMatchingInteractions(analysis?.matchingInteractions ?? []);
    const freeTexts = sortFreeTextInteractions(analysis?.freeTextInteractions ?? []);
    const schemaVersion = analysis?.schemaVersion ?? '';
    const restoredAnswers = nextPage && analysis
      ? readAnswersForPage(
          bookId,
          nextPage.pageNumber,
          blanks,
          choices,
          grids,
          sentenceOrderings,
          matchings,
          freeTexts,
          schemaVersion,
        )
      : {};
    setInteraction({
      spans: analysis?.textSpans ?? [],
      blanks,
      choices,
      choiceGroups,
      grids,
      sentenceOrderings,
      matchings,
      freeTexts,
      answers: restoredAnswers,
      schemaVersion,
      selectedSpan: null,
      selectedBlank: null,
      selectedChoice: null,
    });
    setOrderingActivePrompt(null);
    dispatchMatchingSelection({ type: 'clear' });
    dispatchOrderingView({ type: 'reset' });
  }, []);

  const clearPageInteraction = useCallback(() => {
    setPage(null);
    setInteraction(emptyPageInteractionState());
  }, []);

  const selectPage = useCallback((nextPage: number) => {
    if (nextPage === activePage.current) return;
    flushPendingAnswers();
    clearPageInteraction();
    // Preload the target page's saved rotation so the canvas is never drawn
    // with the previous page's rotation while the page resource loads.
    const bookId = bookIdRef.current;
    if (bookId) setRotation(readPageRotation(bookId, nextPage));
    setSelectedPage(nextPage);
    localStorage.setItem(CURRENT_PAGE_KEY, String(nextPage));
  }, [clearPageInteraction, flushPendingAnswers]);

  useEffect(() => {
    const bookId = localStorage.getItem(CURRENT_BOOK_KEY);
    if (!bookId) return;

    const restore = async () => {
      const restoreToken = uploadTokenRef.current;
      setStatus('restoring');
      try {
        const [bookRes, sourceRes, pages] = await Promise.all([
          fetch(`/api/books/${bookId}`),
          fetch(`/api/books/${bookId}/source`),
          getBookPages(bookId),
        ]);
        if (uploadTokenRef.current !== restoreToken) return;
        if (!bookRes.ok || !sourceRes.ok) throw new Error('Stored book is unavailable');

        const storedBook: BookInfo = await bookRes.json();
        const restoredPage = Math.min(selectedPage, storedBook.pageCount);
        if (uploadTokenRef.current !== restoreToken) return;
        setSelectedPage(restoredPage);
        localStorage.setItem(CURRENT_PAGE_KEY, String(restoredPage));
        setBook(storedBook);
        setPdfData(await sourceRes.arrayBuffer());
        setRotation(readPageRotation(storedBook.id, restoredPage));
        showPage(pages.find((candidate) => candidate.pageNumber === restoredPage) ?? null, storedBook.id);
        setStatus('ready');
      } catch (error) {
        if (uploadTokenRef.current !== restoreToken) return;
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

  const getActivePageNumber = useCallback(() => activePage.current, []);

  useProcessingRecoveryTracker({
    enabled: status === 'ready',
    bookId: book?.id,
    page,
    processingTarget,
    getCurrentPageNumber: getActivePageNumber,
    onPageUpdate: showPage,
  });

  const handleUpload = useCallback(async (file: File) => {
    const uploadToken = ++uploadTokenRef.current;
    setStatus('uploading');
    setRotation(0);
    const form = new FormData();
    form.append('file', file);
    form.append('language', 'de');

    const res = await fetch('/api/books', { method: 'POST', body: form });
    if (uploadTokenRef.current !== uploadToken) return;
    if (!res.ok) {
      setStatus('idle');
      console.error('Upload failed:', res.status);
      return;
    }
    const info: BookInfo = await res.json();
    if (uploadTokenRef.current !== uploadToken) return;
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
    const data = await file.arrayBuffer();
    if (uploadTokenRef.current !== uploadToken) return;
    setPdfData(data);
    setStatus('ready');
  }, [clearPageInteraction, flushPendingAnswers]);

  const handleProcessPage = useCallback(async () => {
    if (!book) return;
    if (processingInFlight.current) return;

    const processAction = getPageProcessAction(page);
    if (processAction === 'none') return;

    const bookId = book.id;
    const pageNumber = selectedPage;
    const controller = new AbortController();
    processingInFlight.current = true;
    setProcessingTarget({ bookId, pageNumber });
    flushPendingAnswers();
    setInteraction(emptyPageInteractionState());

    const poll = window.setInterval(() => {
      if (activePage.current !== pageNumber) return;
      void getBookPage(bookId, pageNumber, controller.signal)
        .then((current) => {
          if (activePage.current !== pageNumber) return;
          showPage(current, bookId);
        })
        .catch((error: unknown) => {
          const err = error as { name?: string; status?: number };
          if (err.name === 'AbortError') return;
          if (err.status !== 404) console.error('Page polling failed:', error);
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
      processingInFlight.current = false;
      setProcessingTarget(null);
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
      sentenceOrderings: interaction.sentenceOrderings,
      matchings: interaction.matchings,
      freeTexts: interaction.freeTexts,
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
      sentenceOrderings: interaction.sentenceOrderings,
      matchings: interaction.matchings,
      freeTexts: interaction.freeTexts,
      schemaVersion: interaction.schemaVersion,
    });
  }, [interaction, scheduleAnswerPersist]);

  const handleOrderingChange = useCallback((
    interactionId: string,
    ordered: string[],
  ) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const value = serializeOrderedAnswer(ordered);
    const answers = { ...interaction.answers, [interactionId]: value };
    setInteraction((current) => ({ ...current, answers }));
    scheduleAnswerPersist({
      bookId,
      pageNumber: activePage.current,
      answers,
      blanks: interaction.blanks,
      choices: interaction.choices,
      grids: interaction.grids,
      sentenceOrderings: interaction.sentenceOrderings,
      matchings: interaction.matchings,
      freeTexts: interaction.freeTexts,
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
      sentenceOrderings: interaction.sentenceOrderings,
      matchings: interaction.matchings,
      freeTexts: interaction.freeTexts,
      schemaVersion: interaction.schemaVersion,
    });
  }, [interaction, scheduleAnswerPersist]);

  const handleOrderingFragmentClick = useCallback((
    interactionId: string,
    itemId: string,
  ) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const exerciseId = interaction.sentenceOrderings
      .find((i) => i.id === interactionId)?.exerciseId;
    if (orderingMode === 'docked') {
      setRailTab('interactions');
      setOrderingPanelCollapsed(false);
    } else if (exerciseId) {
      dispatchOrderingView({ type: 'expand', exerciseId });
    }
    setOrderingActivePrompt(interactionId);
    const ordered = toggleItem(
      parseOrderedAnswer(interaction.answers[interactionId]),
      itemId,
    );
    handleOrderingChange(interactionId, ordered);
  }, [interaction, orderingMode, handleOrderingChange]);

  const persistMatchingAnswer = useCallback((
    interactionId: string,
    pairs: ReturnType<typeof parseMatchingAnswer>,
  ) => {
    const bookId = bookIdRef.current;
    if (!bookId) return;
    const answers = { ...interaction.answers };
    if (Object.keys(pairs).length === 0) {
      delete answers[interactionId];
    } else {
      answers[interactionId] = serializeMatchingAnswer(pairs);
    }
    setInteraction((current) => ({ ...current, answers }));
    scheduleAnswerPersist({
      bookId,
      pageNumber: activePage.current,
      answers,
      blanks: interaction.blanks,
      choices: interaction.choices,
      grids: interaction.grids,
      sentenceOrderings: interaction.sentenceOrderings,
      matchings: interaction.matchings,
      freeTexts: interaction.freeTexts,
      schemaVersion: interaction.schemaVersion,
    });
  }, [interaction, scheduleAnswerPersist]);

  const handleMatchingItemClick = useCallback((
    interactionId: string,
    itemId: string,
    side: 'left' | 'right',
  ) => {
    const current = matchingSelection;
    if (
      current
      && current.interactionId === interactionId
      && current.side !== side
    ) {
      const leftId = side === 'left' ? itemId : current.itemId;
      const rightId = side === 'right' ? itemId : current.itemId;
      const pairs = matchItems(
        parseMatchingAnswer(interaction.answers[interactionId]),
        leftId,
        rightId,
      );
      persistMatchingAnswer(interactionId, pairs);
      dispatchMatchingSelection({ type: 'clear' });
      return;
    }
    dispatchMatchingSelection(
      side === 'left'
        ? { type: 'select-left', interactionId, itemId }
        : { type: 'select-right', interactionId, itemId },
    );
  }, [interaction, matchingSelection, persistMatchingAnswer]);

  const handleMatchingUnpair = useCallback((
    interactionId: string,
    itemId: string,
  ) => {
    const pairs = unmatchItem(
      parseMatchingAnswer(interaction.answers[interactionId]),
      itemId,
    );
    persistMatchingAnswer(interactionId, pairs);
  }, [interaction, persistMatchingAnswer]);

  const handleMatchingReset = useCallback((interactionId: string) => {
    persistMatchingAnswer(interactionId, {});
  }, [persistMatchingAnswer]);

  const handleOrderingDock = useCallback(() => {
    dispatchOrderingView({ type: 'dock' });
    setRailTab('interactions');
  }, []);

  const handleOrderingFloat = useCallback(() => {
    dispatchOrderingView({ type: 'float' });
  }, []);

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

  const currentPageProcessing = isCurrentPageProcessing(processingTarget, book?.id, selectedPage);
  const pageStage = currentPageStage(page?.processingStatus, currentPageProcessing);
  const processing = isProcessingStage(pageStage);
  const processingBusy = processingTarget !== null;
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
                  aria-label={`Go to page, currently page ${selectedPage} of ${book.pageCount}`}
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
                disabled={processControl === 'none' || processControl === 'processed' || processing || processingBusy}
              >
                {processButtonLabel}
              </button>
              {processingBusy && !processing && (
                <span className="status">Processing page {processingTarget?.pageNumber}…</span>
              )}
            </>
          )}

          <select
            value={zoom}
            onChange={(event) => {
              const nextZoom = Number(event.target.value);
              setZoom(nextZoom);
              writeZoomPreference(nextZoom);
            }}
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

          <label className="toggle">
            <input
              type="checkbox"
              checked={showSentenceOrderingDetection}
              onChange={(event) => {
                setShowSentenceOrderingDetection(event.target.checked);
                writeBooleanPreference(SHOW_SENTENCE_ORDERING_DETECTION_KEY, event.target.checked);
              }}
            />
            Show ordering detection
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showMatchingDetection}
              onChange={(event) => {
                setShowMatchingDetection(event.target.checked);
                writeBooleanPreference(SHOW_MATCHING_DETECTION_KEY, event.target.checked);
              }}
            />
            Show matching detection
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showFreeTextDetection}
              onChange={(event) => {
                setShowFreeTextDetection(event.target.checked);
                writeBooleanPreference(SHOW_FREE_TEXT_DETECTION_KEY, event.target.checked);
              }}
            />
            Show free-text detection
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
              sentenceOrderings={interaction.sentenceOrderings}
              matchings={interaction.matchings}
              freeTexts={interaction.freeTexts}
              answers={interaction.answers}
              activeOrderingPromptId={orderingActivePrompt}
              orderingFloat={orderingMode === 'floating' ? {
                expandedExerciseId: expandedOrderingExercise,
                closedExerciseIds: closedOrderingExercises,
                onExpand: (exerciseId) => dispatchOrderingView({ type: 'expand', exerciseId }),
                onCollapse: () => dispatchOrderingView({ type: 'collapse' }),
                onClose: (exerciseId) => dispatchOrderingView({ type: 'close', exerciseId }),
                onDock: handleOrderingDock,
                onPromptChange: setOrderingActivePrompt,
                onOrderingChange: handleOrderingChange,
              } : undefined}
              matchingSelection={matchingSelection}
              zoom={zoom}
              showBoxes={showBoxes}
              showBlankDetection={showBlankDetection}
              showChoiceDetection={showChoiceDetection}
              showGridDetection={showGridDetection}
              showSentenceOrderingDetection={showSentenceOrderingDetection}
              showMatchingDetection={showMatchingDetection}
              showFreeTextDetection={showFreeTextDetection}
              selectedChoice={interaction.selectedChoice}
              processingStage={pageStage}
              onSpanClick={handleSpanClick}
              onBlankClick={handleBlankClick}
              onAnswerChange={handleAnswerChange}
              onChoiceClick={handleChoiceClick}
              onChoiceSelect={handleChoiceSelect}
              onChoiceClose={handleChoiceClose}
              onGridSelect={handleGridSelect}
              onOrderingFragmentClick={handleOrderingFragmentClick}
              onOrderingChange={handleOrderingChange}
              onMatchingItemClick={handleMatchingItemClick}
              onMatchingUnpair={handleMatchingUnpair}
              onMatchingReset={handleMatchingReset}
            />
          ) : (
            <div className="empty-state">Upload a scanned PDF to begin</div>
          )}
        </div>
        <aside className="interaction-rail">
          {orderingMode === 'docked' ? (
            <>
              <div className="rail-tabs" role="tablist" aria-label="Reader tools">
                {interaction.sentenceOrderings.length > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={railTab === 'interactions'}
                    className={`rail-tab${railTab === 'interactions' ? ' rail-tab-active' : ''}`}
                    onClick={() => setRailTab('interactions')}
                  >
                    Ordering ({interaction.sentenceOrderings.length})
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={railTab === 'debug'}
                  className={`rail-tab${railTab === 'debug' ? ' rail-tab-active' : ''}`}
                  onClick={() => setRailTab('debug')}
                >
                  Debug
                </button>
              </div>
              {railTab === 'interactions' && interaction.sentenceOrderings.length > 0 ? (
                <SentenceOrderingPanel
                  sentenceOrderings={interaction.sentenceOrderings}
                  orderingAnswers={interaction.answers}
                  activePromptId={orderingActivePrompt}
                  disabled={processing}
                  collapsed={orderingPanelCollapsed}
                  onPromptChange={setOrderingActivePrompt}
                  onOrderingChange={handleOrderingChange}
                  onCollapseChange={setOrderingPanelCollapsed}
                  onFloat={handleOrderingFloat}
                />
              ) : (
                <DebugPanel
                  span={interaction.selectedSpan}
                  blank={interaction.selectedBlank}
                  choice={interaction.selectedChoice}
                />
              )}
            </>
          ) : (
            <DebugPanel
              span={interaction.selectedSpan}
              blank={interaction.selectedBlank}
              choice={interaction.selectedChoice}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
