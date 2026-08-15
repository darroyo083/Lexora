import { lazy, Suspense, useState, useCallback, useEffect, useMemo, useRef, useReducer } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { FileText } from 'lucide-react';
import LeftRail from './components/LeftRail';
import ReaderToolbar from './components/ReaderToolbar';
import RightRail from './components/RightRail';
import CheckBar from './components/CheckBar';
import InteractiveLesson from './interactive/InteractiveLesson';
import { projectLesson } from './interactive/projectLesson';
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
import {
  getBookPage,
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
import {
  CorrectionVerdict,
  AnswerResolutionStatus,
  readRevealBitsForPage,
  writeRevealBit,
} from './state/correction';
import {
  fetchAnswerKey,
  fetchPageCorrection,
  type AnswerKey,
  type CorrectionSlot,
  type PageCorrectionResolution,
} from './api/correction';
import { computeCorrectionMap, parseMatchingPairsFromEntry } from './reader/correction';
import {
  migrateDesignVariantPreference,
  readDevModePreference,
  readThemeModePreference,
  writeDevModePreference,
  writeThemeModePreference,
  type ThemeMode,
} from './state/theme';
import { readReaderMode, writeReaderMode, type ReaderMode } from './state/readerMode';
import { fetchAssistConfig, type ExerciseContext, type SelectionRect } from './api/assist';
import { computeCanCheck, kindOrdinal } from './reader/assistContext';

const PageViewer = lazy(() => import('./reader/PageViewer'));

type Status = 'idle' | 'restoring' | 'uploading' | 'ready';

interface BookInfo {
  id: string;
  pageCount: number;
}

interface PublicDemoInfo {
  bookId: string;
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
  const publicDemoEntry = window.location.pathname.startsWith('/demo');
  const [devMode, setDevMode] = useState<boolean>(() => (
    import.meta.env.DEV && !publicDemoEntry && readDevModePreference()
  ));

  const [status, setStatus] = useState<Status>(() => (
    localStorage.getItem(CURRENT_BOOK_KEY) || publicDemoEntry ? 'restoring' : 'idle'
  ));
  const [publicDemo, setPublicDemo] = useState(false);
  const publicRuntime = publicDemoEntry || publicDemo;
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
  const [orderingActivePrompt, setOrderingActivePrompt] = useState<string | null>(null);
  const [orderingPanelCollapsed, setOrderingPanelCollapsed] = useState(false);
  const [matchingSelection, dispatchMatchingSelection] = useReducer(
    matchingSelectionReducer,
    null,
  );
  const [orderingView, dispatchOrderingView] = useReducer(
    orderingViewReducer,
    undefined,
    () => emptyOrderingView(publicDemoEntry ? 'floating' : readOrderingModePreference()),
  );
  const { mode: orderingMode, expandedExerciseId: expandedOrderingExercise, closedExerciseIds: closedOrderingExercises } = orderingView;
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => readThemeModePreference());
  const [readerMode, setReaderMode] = useState<ReaderMode>(readReaderMode);
  const [answerKey, setAnswerKey] = useState<{ bookId: string; value: AnswerKey } | null>(null);
  const [pageCorrection, setPageCorrection] = useState<PageCorrectionResolution | null>(null);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);
  const [correctionLoadError, setCorrectionLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const [pageReloadNonce, setPageReloadNonce] = useState(0);
  const [correctionReloadNonce, setCorrectionReloadNonce] = useState(0);
  const [sourceReloadNonce, setSourceReloadNonce] = useState(0);
  const [correctionVerdicts, setCorrectionVerdicts] = useState<Record<string, CorrectionVerdict | undefined>>({});
  const [correctionResolutions, setCorrectionResolutions] = useState<Record<string, AnswerResolutionStatus>>({});
  const [correctionDetails, setCorrectionDetails] = useState<Record<string, { correctCount: number; totalCount: number }>>({});
  const [correctionUiState, setCorrectionUiState] = useState<string>('IDLE');
  const [correctionReveal, setCorrectionReveal] = useState<Record<string, boolean>>({});
  const [assistEnabled, setAssistEnabled] = useState(false);
  const [assistSiteKey, setAssistSiteKey] = useState<string | null>(null);
  const [classicSelectionMode, setClassicSelectionMode] = useState(false);
  const [classicSelection, setClassicSelection] = useState<SelectionRect | null>(null);
  const [interactiveExercise, setInteractiveExercise] = useState<{
    exerciseId: string;
    assistExerciseId?: string;
    kind: string;
    answer: string | null;
  } | null>(null);
  const activePage = useRef(selectedPage);
  const processingInFlight = useRef(false);
  const bookIdRef = useRef<string | null>(null);
  const persistTimer = useRef<number | null>(null);
  const pendingPersist = useRef<PendingPersist | null>(null);
  const uploadTokenRef = useRef(0);
  const correctionCheckRef = useRef<() => void>(() => {});
  activePage.current = selectedPage;

  const currentAnswerKey = answerKey !== null && answerKey.bookId === book?.id
    ? answerKey.value
    : null;
  const currentPageCorrection = pageCorrection !== null
    && pageCorrection.bookId === book?.id
    && pageCorrection.pageNumber === selectedPage
    ? pageCorrection
    : null;
  const correctionSlots: CorrectionSlot[] = currentPageCorrection?.slots ?? [];
  const pageUnitNumber = currentPageCorrection?.unitNumber ?? null;
  const pageUnitTitle = currentPageCorrection?.unitTitle ?? null;
  const correctionReady = currentAnswerKey !== null
    && currentPageCorrection !== null
    && correctionLoadError === null;

  const handleToggleTheme = useCallback(() => {
    setTheme((curr) => {
      const next = curr === 'dark' ? 'light' : 'dark';
      writeThemeModePreference(next);
      return next;
    });
  }, []);

  const handleReaderModeChange = useCallback((mode: ReaderMode) => {
    setReaderMode(mode);
    setClassicSelectionMode(false);
    setClassicSelection(null);
    writeReaderMode(mode);
  }, []);

  const handleStartClassicSelection = useCallback(() => {
    setClassicSelection(null);
    setClassicSelectionMode(true);
  }, []);

  const handleClassicSelectionComplete = useCallback((nextSelection: SelectionRect) => {
    setClassicSelection(nextSelection);
    setClassicSelectionMode(false);
  }, []);

  const handleClassicSelectionCancel = useCallback(() => {
    setClassicSelectionMode(false);
  }, []);

  const handleClearClassicSelection = useCallback(() => {
    setClassicSelection(null);
    setClassicSelectionMode(true);
  }, []);

  const selectionHasContext = useMemo(() => {
    if (!classicSelection) return false;
    return interaction.spans.some((span) => (
      span.bbox.x < classicSelection.x + classicSelection.width
      && span.bbox.x + span.bbox.width > classicSelection.x
      && span.bbox.y < classicSelection.y + classicSelection.height
      && span.bbox.y + span.bbox.height > classicSelection.y
      && span.text.trim().length > 0
    ));
  }, [classicSelection, interaction.spans]);

  const handleToggleDevMode = useCallback(() => {
    if (!import.meta.env.DEV || publicDemoEntry) return;
    setDevMode((curr) => {
      const next = !curr;
      writeDevModePreference(next);
      return next;
    });
  }, []);

  useEffect(() => {
    bookIdRef.current = book?.id ?? null;
  }, [book]);

  useEffect(() => {
    migrateDesignVariantPreference();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAssistConfig(controller.signal)
      .then((config) => {
        setAssistEnabled(config.enabled);
        setAssistSiteKey(config.siteKey ?? null);
      })
      .catch(() => {
        setAssistEnabled(false);
        setAssistSiteKey(null);
      });
    return () => controller.abort();
  }, []);

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
    if (nextPage) setRotation(readPageRotation(bookId, nextPage.pageNumber));
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
    if (bookId && nextPage) {
      const revealBits = readRevealBitsForPage(
        bookId, nextPage.pageNumber,
        blanks, choices, grids, sentenceOrderings, matchings, freeTexts,
        schemaVersion,
      );
      setCorrectionReveal(revealBits);
    } else {
      setCorrectionReveal({});
    }
    setCorrectionVerdicts({});
    setCorrectionResolutions({});
    setCorrectionDetails({});
    setCorrectionUiState('IDLE');
  }, []);

  const clearPageInteraction = useCallback(() => {
    setPage(null);
    setInteraction(emptyPageInteractionState());
  }, []);

  const selectPage = useCallback((nextPage: number) => {
    if (nextPage === activePage.current) return;
    flushPendingAnswers();
    clearPageInteraction();
    setPageCorrection(null);
    setPageLoadError(null);
    setCorrectionLoadError(null);
    const bookId = bookIdRef.current;
    if (bookId) setRotation(readPageRotation(bookId, nextPage));
    setSelectedPage(nextPage);
    localStorage.setItem(CURRENT_PAGE_KEY, String(nextPage));
  }, [clearPageInteraction, flushPendingAnswers]);

  const loadAnswerKey = useCallback(async (bookId: string, signal?: AbortSignal) => {
    try {
      const key = await fetchAnswerKey(bookId, signal);
      setAnswerKey({ bookId, value: key });
      setCorrectionLoadError(null);
    } catch (error) {
      const requestError = error as Error & { name?: string; status?: number };
      if (requestError.name === 'AbortError') return;
      setAnswerKey(null);
      if (requestError.status === 404) {
        setCorrectionLoadError(null);
      } else {
        setCorrectionLoadError('Correction data could not be loaded. Your answers are safe; try again before checking them.');
      }
    }
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Toggle Dev Mode via Ctrl+Shift+D or Cmd+Shift+D
      if (import.meta.env.DEV && (event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'D' || event.key === 'd')) {
        event.preventDefault();
        handleToggleDevMode();
        return;
      }

      // Check if user is typing in an input or textarea
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (!book) return;

      // Ctrl+Enter: Check answers
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        correctionCheckRef.current();
        return;
      }

      // Ctrl+Shift+F: Focus next incorrect item
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'F' || event.key === 'f')) {
        event.preventDefault();
        return;
      }

      // Ctrl+Shift+R: Reveal answer
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'R' || event.key === 'r')) {
        event.preventDefault();
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'PageUp' || event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        selectPage(Math.max(1, activePage.current - 1));
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === 'j' || event.key === 'J') {
        event.preventDefault();
        selectPage(Math.min(book.pageCount, activePage.current + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [book, selectPage, handleToggleDevMode]);

  useEffect(() => {
    const bookId = localStorage.getItem(CURRENT_BOOK_KEY);
    if (!bookId && !publicDemoEntry) return;

    const restore = async () => {
      const restoreToken = uploadTokenRef.current;
      setStatus('restoring');
      try {
        let nextBookId = bookId;
        let demoInfo: PublicDemoInfo | null = null;

        if (publicDemoEntry) {
          const demoRes = await fetch('/api/public-demo');
          if (uploadTokenRef.current !== restoreToken) return;
          if (demoRes.ok) {
            const parsedDemo: PublicDemoInfo = await demoRes.json();
            demoInfo = parsedDemo;
            nextBookId = parsedDemo.bookId;
            setPublicDemo(true);
            setReaderMode('interactive');
            writeReaderMode('interactive');
          } else if (demoRes.status !== 404) {
            throw new Error('Public demo is unavailable');
          } else {
            // A public route must never fall through to a private local book.
            nextBookId = null;
            localStorage.removeItem(CURRENT_BOOK_KEY);
          }
        }

        if (!nextBookId) {
          setStatus('idle');
          return;
        }

        const bookRes = await fetch(`/api/books/${nextBookId}`);
        if (uploadTokenRef.current !== restoreToken) return;
        if (!bookRes.ok) throw new Error('Stored book is unavailable');

        const storedBook: BookInfo = await bookRes.json();
        if (demoInfo && storedBook.pageCount !== demoInfo.pageCount) {
          throw new Error('Public demo metadata is inconsistent');
        }
        const restoredPage = Math.min(activePage.current, storedBook.pageCount);
        if (uploadTokenRef.current !== restoreToken) return;
        setSelectedPage(restoredPage);
        localStorage.setItem(CURRENT_PAGE_KEY, String(restoredPage));
        localStorage.setItem(CURRENT_BOOK_KEY, storedBook.id);
        setBook(storedBook);
        setPdfData(null);
        setRotation(readPageRotation(storedBook.id, restoredPage));
        setStatus('ready');
        void loadAnswerKey(storedBook.id);
      } catch (error) {
        if (uploadTokenRef.current !== restoreToken) return;
        localStorage.removeItem(CURRENT_BOOK_KEY);
        setStatus('idle');
        setUploadError(publicDemoEntry
          ? 'The public demo is temporarily unavailable. Please try again shortly.'
          : 'The saved workbook could not be reopened. Upload it again to continue.');
      }
    };

    void restore();
  }, [loadAnswerKey, publicDemoEntry]);

  useEffect(() => {
    if (!book || status === 'restoring') return;

    const controller = new AbortController();
    clearPageInteraction();
    setPageLoadError(null);

    void getBookPage(book.id, selectedPage, controller.signal)
      .then((persisted) => {
        showPage(persisted, book.id);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        if (error.status === 404) {
          showPage(null, book.id);
          return;
        }
        setPageLoadError('This page could not be loaded. Try again, or continue with the source in Classic mode.');
      });

    return () => controller.abort();
  }, [book, selectedPage, status, showPage, clearPageInteraction, pageReloadNonce]);

  useEffect(() => {
    if (!book || status === 'restoring') return;
    if (!currentAnswerKey) {
      setPageCorrection(null);
      return;
    }
    const controller = new AbortController();
    setPageCorrection(null);
    setCorrectionLoadError(null);
    fetchPageCorrection(book.id, selectedPage, controller.signal)
      .then((resolution) => {
        setPageCorrection(resolution);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setPageCorrection(null);
          setCorrectionLoadError('Correction data could not be loaded. Your answers are safe; try again before checking them.');
        }
      });
    return () => controller.abort();
  }, [book, selectedPage, status, currentAnswerKey, correctionReloadNonce]);

  useEffect(() => {
    if (!book || readerMode !== 'classic' || pdfData || status === 'restoring') return;
    const controller = new AbortController();
    setSourceLoadError(null);
    void fetch(`/api/books/${book.id}/source`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Source loading failed: ${response.status}`);
        setPdfData(await response.arrayBuffer());
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setSourceLoadError('The source PDF could not be loaded. Try again without leaving this workbook.');
        }
      });
    return () => controller.abort();
  }, [book, readerMode, pdfData, status, sourceReloadNonce]);

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
    const fallbackStatus: Status = book ? 'ready' : 'idle';
    setStatus('uploading');
    setUploadError(null);
    setRotation(0);
    const form = new FormData();
    form.append('file', file);
    form.append('language', 'de');

    try {
      const res = await fetch('/api/books', { method: 'POST', body: form });
      if (uploadTokenRef.current !== uploadToken) return;
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const info: BookInfo = await res.json();
      if (uploadTokenRef.current !== uploadToken) return;
      if (!info?.id) throw new Error('Upload returned invalid book info');

      const data = await file.arrayBuffer();
      if (uploadTokenRef.current !== uploadToken) return;
      flushPendingAnswers();
      setAnswerKey(null);
      setPageCorrection(null);
      setCorrectionLoadError(null);
      setBook(info);
      clearPageInteraction();
      setSelectedPage(1);
      localStorage.setItem(CURRENT_BOOK_KEY, info.id);
      localStorage.setItem(CURRENT_PAGE_KEY, '1');
      setPdfData(data);
      setSourceLoadError(null);
      setStatus('ready');
      void loadAnswerKey(info.id);
    } catch {
      if (uploadTokenRef.current !== uploadToken) return;
      setStatus(fallbackStatus);
      setUploadError('The PDF could not be uploaded. Check the connection and choose the file again.');
    }
  }, [book, clearPageInteraction, flushPendingAnswers, loadAnswerKey]);

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

  const handleCorrectionCheck = useCallback((itemIds?: string[]) => {
    if (!correctionReady) return;
    const slots = correctionSlots;

    function correctionSource(kind: string, index: number) {
      const slot = slots.find(
        (s) => s.interactionKind === kind && s.ordinal === index,
      );
      return {
        entry: slot?.resolution === 'RESOLVED' ? (slot.entry ?? undefined) : undefined,
        sourceResolution: slot
          ? AnswerResolutionStatus[slot.resolution]
          : AnswerResolutionStatus.UNMAPPED,
      };
    }

    const result = computeCorrectionMap({
      blanks: interaction.blanks.map((blank, index) => ({
        id: blank.id,
        blank,
        learnerValue: interaction.answers[blank.id],
        ...correctionSource('fill-in-line', index),
      })),
      choices: interaction.choices.map((choice, index) => ({
        id: choice.id,
        choice,
        learnerValue: interaction.answers[choice.id],
        ...correctionSource('choice', index),
      })),
      choiceGroups: interaction.choiceGroups,
      grids: interaction.grids.map((grid, index) => ({
        id: grid.id,
        grid,
        learnerValues: Object.fromEntries(
          grid.rows.map((row) => [row.id, interaction.answers[row.id]]),
        ),
        rows: grid.rows,
        ...correctionSource('choice-grid', index),
      })),
      orderings: interaction.sentenceOrderings.map((ordering, index) => ({
        id: ordering.id,
        ordering,
        learnerValue: interaction.answers[ordering.id],
        ...correctionSource('sentence-ordering', index),
      })),
      matchings: interaction.matchings.map((matching, index) => ({
        id: matching.id,
        matching,
        learnerValue: interaction.answers[matching.id],
        ...correctionSource('matching', index),
      })),
      freeTexts: interaction.freeTexts.map((freeText, index) => ({
        id: freeText.id,
        freeText,
        learnerValue: interaction.answers[freeText.id],
        ...correctionSource('free-text', index),
      })),
    });

    if (itemIds && itemIds.length > 0) {
      const selected = new Set(itemIds);
      setCorrectionVerdicts((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(result.verdictByItem).filter(([id]) => selected.has(id))),
      }));
      setCorrectionResolutions((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(result.resolutionByItem).filter(([id]) => selected.has(id))),
      }));
      setCorrectionDetails((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(result.resultDetailsByItem).filter(([id]) => selected.has(id))),
      }));
    } else {
      setCorrectionVerdicts(result.verdictByItem);
      setCorrectionResolutions(result.resolutionByItem);
      setCorrectionDetails(result.resultDetailsByItem);
    }
    setCorrectionUiState('CHECKED');
  }, [correctionReady, correctionSlots, interaction]);

  correctionCheckRef.current = () => handleCorrectionCheck();

  const orderingExpectedByItem = useMemo(() => {
    const expected: Record<string, string[]> = {};
    interaction.sentenceOrderings.forEach((ordering, index) => {
      const slot = correctionSlots.find(
        (s) => s.interactionKind === 'sentence-ordering' && s.ordinal === index,
      );
      const entry = slot?.resolution === 'RESOLVED' ? slot.entry : undefined;
      if (entry) expected[ordering.id] = parseOrderedAnswer(entry.expectedValue);
    });
    return expected;
  }, [correctionSlots, interaction.sentenceOrderings]);

  const expectedChoiceLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    interaction.choices.forEach((choice, index) => {
      const slot = correctionSlots.find(
        (s) => s.interactionKind === 'choice' && s.ordinal === index,
      );
      const entry = slot?.resolution === 'RESOLVED' ? slot.entry : undefined;
      if (entry) labels[choice.id] = entry.expectedValue;
    });
    return labels;
  }, [correctionSlots, interaction.choices]);

  const expectedPairsByItem = useMemo(() => {
    const pairs: Record<string, Array<{ left: string; right: string }>> = {};
    interaction.matchings.forEach((matching, index) => {
      const slot = correctionSlots.find(
        (s) => s.interactionKind === 'matching' && s.ordinal === index,
      );
      const entry = slot?.resolution === 'RESOLVED' ? slot.entry : undefined;
      if (entry) pairs[matching.id] = parseMatchingPairsFromEntry(entry, matching);
    });
    return pairs;
  }, [correctionSlots, interaction.matchings]);

  const expectedAnswersByItem = useMemo(() => {
    const expected: Record<string, string> = {};
    const resolvedEntry = (kind: string, ordinal: number) => {
      const slot = correctionSlots.find(
        (candidate) => candidate.interactionKind === kind && candidate.ordinal === ordinal,
      );
      return slot?.resolution === 'RESOLVED' ? slot.entry : null;
    };
    interaction.blanks.forEach((item, index) => {
      const entry = resolvedEntry('fill-in-line', index);
      if (entry) expected[item.id] = entry.expectedValue;
    });
    interaction.choices.forEach((item, index) => {
      const entry = resolvedEntry('choice', index);
      if (entry) expected[item.id] = entry.expectedValue;
    });
    interaction.grids.forEach((item, index) => {
      const entry = resolvedEntry('choice-grid', index);
      if (entry) expected[item.id] = entry.expectedValue;
    });
    interaction.sentenceOrderings.forEach((item, index) => {
      const entry = resolvedEntry('sentence-ordering', index);
      if (entry) expected[item.id] = entry.expectedValue;
    });
    interaction.matchings.forEach((item, index) => {
      const entry = resolvedEntry('matching', index);
      if (entry) expected[item.id] = entry.expectedValue;
    });
    interaction.freeTexts.forEach((item, index) => {
      const entry = resolvedEntry('free-text', index);
      const reference = entry?.typedPayload?.kind === 'reference' ? entry.typedPayload.modelText : null;
      if (reference) expected[item.id] = reference;
    });
    return expected;
  }, [correctionSlots, interaction]);

  const handleCorrectionRetry = useCallback((itemId: string) => {
    setCorrectionVerdicts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setCorrectionResolutions((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setCorrectionDetails((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setCorrectionReveal((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setCorrectionUiState('RETRYING');
    const bookId = bookIdRef.current;
    if (bookId) {
      writeRevealBit(bookId, selectedPage, itemId, false);
    }
  }, [selectedPage]);

  const handleCorrectionReveal = useCallback((itemId: string) => {
    setCorrectionReveal((prev) => ({ ...prev, [itemId]: true }));
    setCorrectionUiState('REVEALED');
    const bookId = bookIdRef.current;
    if (bookId) {
      writeRevealBit(bookId, selectedPage, itemId, true);
    }
  }, [selectedPage]);

  const handleUpdateBoxPref = useCallback((key: string, value: boolean, setter: (val: boolean) => void) => {
    setter(value);
    writeBooleanPreference(key, value);
  }, []);

  const handleRetryPageLoad = useCallback(() => {
    setPageLoadError(null);
    setPageReloadNonce((value) => value + 1);
  }, []);

  const handleRetryCorrectionLoad = useCallback(() => {
    setCorrectionLoadError(null);
    if (book && !currentAnswerKey) {
      void loadAnswerKey(book.id);
    } else {
      setCorrectionReloadNonce((value) => value + 1);
    }
  }, [book, currentAnswerKey, loadAnswerKey]);

  const handleRetrySourceLoad = useCallback(() => {
    setSourceLoadError(null);
    setSourceReloadNonce((value) => value + 1);
  }, []);

  const currentPageProcessing = isCurrentPageProcessing(processingTarget, book?.id, selectedPage);
  const pageStage = currentPageStage(page?.processingStatus, currentPageProcessing);
  const processing = isProcessingStage(pageStage);
  const processingBusy = processingTarget !== null;
  const processControl = resolveProcessControl(pageStage, getPageProcessAction(page));
  const processButtonLabel = processLabel(processControl);
  const lessonProjection = useMemo(() => projectLesson({
    bookId: book?.id ?? '',
    pageNumber: selectedPage,
    analysis: page?.processingStatus === 'READY' ? page.analysis : null,
    unit: pageUnitNumber ? { number: pageUnitNumber, title: pageUnitTitle } : null,
  }), [book?.id, page, pageUnitNumber, pageUnitTitle, selectedPage]);
  const analysisProviderLabel = page?.analysis?.processor?.engine === 'local-ocr'
    ? 'Analysis: Local OCR fallback'
    : page?.analysis?.processor?.engine
      ? 'Analysis: Multimodal analysis'
      : null;

  const currentExercise: ExerciseContext | null = useMemo(() => {
    if (!book) return null;
    if (readerMode === 'interactive') {
      if (!interactiveExercise) return null;
      const ordinal = kindOrdinal(
        interactiveExercise.kind, interactiveExercise.exerciseId, interaction,
      );
      return {
        exerciseId: interactiveExercise.exerciseId,
        assistExerciseId: interactiveExercise.assistExerciseId,
        kind: interactiveExercise.kind,
        answer: interactiveExercise.answer,
        canCheck: computeCanCheck(
          interactiveExercise.kind, ordinal, interactiveExercise.answer, correctionSlots,
        ),
      };
    }
    let exerciseId: string | null = null;
    let kind = '';
    if (interaction.selectedBlank) {
      exerciseId = interaction.selectedBlank.id;
      kind = 'fill-in-line';
    } else if (interaction.selectedChoice) {
      exerciseId = interaction.selectedChoice.id;
      kind = 'choice';
    } else if (orderingActivePrompt) {
      exerciseId = orderingActivePrompt;
      kind = 'sentence-ordering';
    } else if (matchingSelection?.interactionId) {
      exerciseId = matchingSelection.interactionId;
      kind = 'matching';
    }
    if (!exerciseId) return null;
    const answer = interaction.answers[exerciseId] ?? null;
    const ordinal = kindOrdinal(kind, exerciseId, interaction);
    return {
      exerciseId,
      kind,
      answer,
      canCheck: computeCanCheck(kind, ordinal, answer, correctionSlots),
    };
  }, [book, readerMode, interactiveExercise, interaction, orderingActivePrompt,
    matchingSelection, correctionSlots]);

  return (
    <div className="app" data-design="stitch" data-theme={theme} data-dev-mode={publicRuntime ? false : devMode} data-reader-mode={readerMode}>
      {!publicRuntime && <LeftRail devMode={devMode} onToggleDevMode={handleToggleDevMode} />}

      <div className="app-main-workspace">
        <ReaderToolbar
          book={book}
          selectedPage={selectedPage}
          onSelectPage={selectPage}
          onUpload={(file) => void handleUpload(file)}
          onProcessPage={() => void handleProcessPage()}
          processControl={processControl}
          processButtonLabel={processButtonLabel}
          processing={processing}
          processingBusy={processingBusy}
          processingTarget={processingTarget}
          pageStage={pageStage}
          status={status}
          zoom={zoom}
          onZoomChange={(nextZoom) => {
            setZoom(nextZoom);
            writeZoomPreference(nextZoom);
          }}
          rotation={rotation}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          devMode={devMode}
          onToggleDevMode={handleToggleDevMode}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          readerMode={readerMode}
          onReaderModeChange={handleReaderModeChange}
          analysisProviderLabel={analysisProviderLabel}
          readOnly={publicRuntime}
          assist={assistEnabled && readerMode === 'classic' ? {
            bookId: book?.id ?? null,
            pageNumber: selectedPage,
            // Classic is selection-only. Do not leak the last Interactive
            // exercise into the request boundary while a rectangle is active.
            exercise: null,
            siteKey: assistSiteKey,
            mode: 'classic',
            selection: classicSelection,
            selectionHasContext,
            onStartSelection: handleStartClassicSelection,
            onClearSelection: handleClearClassicSelection,
          } : null}
        />

        {uploadError && (
          <div className="reader-request-alert" role="alert">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)}>Dismiss</button>
          </div>
        )}

        <main className={`reader-layout ${readerMode === 'interactive' ? 'reader-layout-interactive' : ''}`}>
          <div className="page-area">
            {readerMode === 'classic' && pageLoadError && (
              <div className="reader-page-warning" role="alert">
                <span>{pageLoadError}</span>
                <button type="button" onClick={handleRetryPageLoad}>Retry page data</button>
              </div>
            )}
            {status === 'restoring' ? (
              <div className="restoration-skeleton" aria-label="Restoring PDF">
                <Skeleton width="100%" height="100%" />
              </div>
            ) : publicRuntime && !book ? (
              <div className="empty-state public-demo-error" role="status">
                <div className="empty-hero">
                  <div className="empty-hero-icon"><FileText size={36} strokeWidth={1.5} /></div>
                  <h2>Public demo unavailable</h2>
                  <p>{uploadError ?? 'The curated workbook could not be loaded. Try again shortly.'}</p>
                  <button type="button" className="lesson-secondary-action" onClick={() => window.location.reload()}>
                    Retry public demo
                  </button>
                </div>
              </div>
            ) : readerMode === 'interactive' && book ? (
              <InteractiveLesson
                projection={lessonProjection}
                pageNumber={selectedPage}
                pageCount={book.pageCount}
                pageStage={pageStage}
                failureReason={page?.failureReason ?? null}
                pageLoadError={pageLoadError}
                correctionLoadError={correctionLoadError}
                answers={interaction.answers}
                matchingSelection={matchingSelection}
                verdictByItem={correctionVerdicts}
                resolutionByItem={correctionResolutions}
                correctionDetails={correctionDetails}
                reveal={correctionReveal}
                expectedByItem={expectedAnswersByItem}
                canCheck={correctionReady}
                onSelectPage={selectPage}
                onProcessPage={() => void handleProcessPage()}
                onRetryPageLoad={handleRetryPageLoad}
                onRetryCorrectionLoad={handleRetryCorrectionLoad}
                onUseClassic={() => handleReaderModeChange('classic')}
                onAnswerChange={handleAnswerChange}
                onChoiceSelect={handleChoiceSelect}
                onGridSelect={handleGridSelect}
                onOrderingItemClick={handleOrderingFragmentClick}
                onMatchingItemClick={handleMatchingItemClick}
                onMatchingUnpair={handleMatchingUnpair}
                onMatchingReset={handleMatchingReset}
                onCheck={handleCorrectionCheck}
                onRetry={handleCorrectionRetry}
                onReveal={handleCorrectionReveal}
                onActiveExerciseChange={setInteractiveExercise}
                assist={assistEnabled ? {
                  bookId: book.id,
                  pageNumber: selectedPage,
                  exercise: currentExercise,
                  siteKey: assistSiteKey,
                } : null}
              />
            ) : readerMode === 'classic' && sourceLoadError ? (
              <div className="reader-source-error" role="alert">
                <FileText size={32} aria-hidden="true" />
                <h1>Classic source unavailable</h1>
                <p>{sourceLoadError}</p>
                <button type="button" onClick={handleRetrySourceLoad}>Retry source</button>
              </div>
            ) : readerMode === 'classic' && !pdfData ? (
              <div className="restoration-skeleton" aria-label="Loading Classic source">
                <Skeleton width="100%" height="100%" />
              </div>
            ) : pdfData ? (
              <Suspense fallback={(
                <div className="restoration-skeleton" aria-label="Loading Classic reader">
                  <Skeleton width="100%" height="100%" />
                </div>
              )}>
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
                  onDock: import.meta.env.DEV && devMode ? handleOrderingDock : undefined,
                  onPromptChange: setOrderingActivePrompt,
                  onOrderingChange: handleOrderingChange,
                } : undefined}
                matchingSelection={matchingSelection}
                zoom={zoom}
                showBoxes={devMode ? showBoxes : false}
                showBlankDetection={devMode ? showBlankDetection : false}
                showChoiceDetection={devMode ? showChoiceDetection : false}
                showGridDetection={devMode ? showGridDetection : false}
                showSentenceOrderingDetection={devMode ? showSentenceOrderingDetection : false}
                showMatchingDetection={devMode ? showMatchingDetection : false}
                showFreeTextDetection={devMode ? showFreeTextDetection : false}
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
                verdictByItem={correctionVerdicts}
                resolutionByItem={correctionResolutions}
                reveal={correctionReveal}
                expectedChoiceLabels={expectedChoiceLabels}
                expectedSequencesByItem={orderingExpectedByItem}
                expectedPairsByItem={expectedPairsByItem}
                selectionMode={classicSelectionMode}
                selection={classicSelection}
                onSelectionComplete={handleClassicSelectionComplete}
                onSelectionCancel={handleClassicSelectionCancel}
              />
              </Suspense>
            ) : publicRuntime ? (
              <div className="empty-state public-demo-error" role="status">
                <div className="empty-hero">
                  <div className="empty-hero-icon"><FileText size={36} strokeWidth={1.5} /></div>
                  <h2>Public demo unavailable</h2>
                  <p>{uploadError ?? 'The curated workbook could not be loaded. Try again shortly.'}</p>
                  <button type="button" className="lesson-secondary-action" onClick={() => window.location.reload()}>
                    Retry public demo
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-hero">
                  <div className="empty-hero-icon">
                    <FileText size={36} strokeWidth={1.5} />
                  </div>
                  <h2>Welcome to Lexora Study Reader</h2>
                  <p>Upload a scanned German workbook PDF to begin interactive exercise practice.</p>
                  <label className="upload-hero-btn">
                    <span>Select Workbook PDF</span>
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
                </div>
              </div>
            )}
          </div>

          {readerMode === 'classic' && (
            <div className="classic-check-dock" aria-label="Answer check">
              <CheckBar
                totalGradable={Object.values(correctionVerdicts).filter(
                  (verdict) => verdict !== undefined && verdict !== CorrectionVerdict.NOT_AUTO_GRADABLE,
                ).length}
                totalCorrect={Object.values(correctionVerdicts).filter(
                  (verdict) => verdict === CorrectionVerdict.CORRECT,
                ).length}
                uiState={correctionUiState}
                hasAnswerKey={correctionReady}
                anyRevealed={Object.values(correctionReveal).some(Boolean)}
                onCheck={handleCorrectionCheck}
                compact
              />
            </div>
          )}

          {readerMode === 'classic' && !publicRuntime && import.meta.env.DEV && devMode && <RightRail
            devMode={devMode}
            spans={interaction.spans}
            blanks={interaction.blanks}
            choices={interaction.choices}
            grids={interaction.grids}
            sentenceOrderings={interaction.sentenceOrderings}
            matchings={interaction.matchings}
            freeTexts={interaction.freeTexts}
            answers={interaction.answers}
            choiceGroups={interaction.choiceGroups}
            expectedSequencesByItem={orderingExpectedByItem}
            selectedSpan={interaction.selectedSpan}
            selectedBlank={interaction.selectedBlank}
            selectedChoice={interaction.selectedChoice}
            orderingActivePrompt={orderingActivePrompt}
            orderingPanelCollapsed={orderingPanelCollapsed}
            processing={processing}
            orderingMode={orderingMode}
            onPromptChange={setOrderingActivePrompt}
            onOrderingChange={handleOrderingChange}
            onCollapseChange={setOrderingPanelCollapsed}
            onFloat={handleOrderingFloat}
            showBoxes={showBoxes}
            setShowBoxes={(val) => handleUpdateBoxPref(SHOW_BOXES_KEY, val, setShowBoxes)}
            showBlankDetection={showBlankDetection}
            setShowBlankDetection={(val) => handleUpdateBoxPref(SHOW_BLANK_DETECTION_KEY, val, setShowBlankDetection)}
            showChoiceDetection={showChoiceDetection}
            setShowChoiceDetection={(val) => handleUpdateBoxPref(SHOW_CHOICE_DETECTION_KEY, val, setShowChoiceDetection)}
            showGridDetection={showGridDetection}
            setShowGridDetection={(val) => handleUpdateBoxPref(SHOW_GRID_DETECTION_KEY, val, setShowGridDetection)}
            showSentenceOrderingDetection={showSentenceOrderingDetection}
            setShowSentenceOrderingDetection={(val) => handleUpdateBoxPref(SHOW_SENTENCE_ORDERING_DETECTION_KEY, val, setShowSentenceOrderingDetection)}
            showMatchingDetection={showMatchingDetection}
            setShowMatchingDetection={(val) => handleUpdateBoxPref(SHOW_MATCHING_DETECTION_KEY, val, setShowMatchingDetection)}
            showFreeTextDetection={showFreeTextDetection}
            setShowFreeTextDetection={(val) => handleUpdateBoxPref(SHOW_FREE_TEXT_DETECTION_KEY, val, setShowFreeTextDetection)}
            onBlankClick={handleBlankClick}
            onChoiceClick={handleChoiceClick}
            verdictByItem={correctionVerdicts}
            resolutionByItem={correctionResolutions}
            correctionDetails={correctionDetails}
            correctionReveal={correctionReveal}
            correctionUiState={correctionUiState}
            hasAnswerKey={correctionReady}
            correctionSlots={correctionSlots}
            onCheck={handleCorrectionCheck}
            onRetry={handleCorrectionRetry}
            onReveal={handleCorrectionReveal}
          />}
        </main>
      </div>
    </div>
  );
}
