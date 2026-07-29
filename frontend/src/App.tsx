import { useState, useCallback, useEffect, useRef } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import PageViewer from './reader/PageViewer';
import DebugPanel from './reader/DebugPanel';
import type { TextSpan } from './reader/types';
import {
  getBookPages,
  processBookPage,
  type BookPageResource,
  type PageProcessingStatus,
} from './api/client';
import { readBooleanPreference, writeBooleanPreference } from './state/preferences';

type Status = 'idle' | 'restoring' | 'uploading' | 'ready';

interface BookInfo {
  id: string;
  pageCount: number;
}

const CURRENT_BOOK_KEY = 'lexora.currentBookId';
const CURRENT_PAGE_KEY = 'lexora.currentPage';
const SHOW_BOXES_KEY = 'lexora.showOcrBoxes';

const PROGRESS: Partial<Record<PageProcessingStatus, number>> = {
  PENDING: 5,
  RASTERIZING: 15,
  OCR: 50,
  PERSISTING: 95,
  READY: 100,
};

const ACTIVE_STAGES: PageProcessingStatus[] = [
  'PENDING', 'RASTERIZING', 'OCR', 'PERSISTING',
];

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
  const [spans, setSpans] = useState<TextSpan[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<TextSpan | null>(null);
  const [showBoxes, setShowBoxes] = useState(() => (
    readBooleanPreference(SHOW_BOXES_KEY, false)
  ));
  const [zoom, setZoom] = useState(1.0);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const activePage = useRef(selectedPage);
  activePage.current = selectedPage;

  const showPage = useCallback((nextPage: BookPageResource | null) => {
    setPage(nextPage);
    setSpans(nextPage?.analysis?.textSpans ?? []);
  }, []);

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
        showPage(pages.find((candidate) => candidate.pageNumber === restoredPage) ?? null);
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
    setSelectedSpan(null);
    showPage(null);

    void getBookPages(book.id, controller.signal)
      .then((pages) => {
        const persisted = pages.find((candidate) => candidate.pageNumber === selectedPage);
        showPage(persisted ?? null);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Page loading failed:', error);
      });

    return () => controller.abort();
  }, [book, selectedPage, status, showPage]);

  const handleUpload = useCallback(async (file: File) => {
    setStatus('uploading');
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

    setBook(info);
    setSelectedPage(1);
    showPage(null);
    localStorage.setItem(CURRENT_BOOK_KEY, info.id);
    localStorage.setItem(CURRENT_PAGE_KEY, '1');
    setPdfData(await file.arrayBuffer());
    setStatus('ready');
  }, [showPage]);

  const handleProcessPage = useCallback(async () => {
    if (!book || page?.processingStatus === 'READY') return;

    const bookId = book.id;
    const pageNumber = selectedPage;
    setProcessingRequested(true);
    setSelectedSpan(null);
    setSpans([]);

    const poll = window.setInterval(() => {
      void getBookPages(bookId).then((pages) => {
        if (activePage.current !== pageNumber) return;
        const current = pages.find((candidate) => candidate.pageNumber === pageNumber);
        if (current) showPage(current);
      });
    }, 250);

    try {
      const result = await processBookPage(bookId, pageNumber);
      if (activePage.current === pageNumber) showPage(result);
    } catch (error) {
      console.error('Processing failed:', error);
    } finally {
      window.clearInterval(poll);
      setProcessingRequested(false);
    }
  }, [book, page, selectedPage, showPage]);

  const handleSpanClick = useCallback((span: TextSpan) => {
    setSelectedSpan(span);
  }, []);

  const pageStage = page?.processingStatus
    ?? (processingRequested ? 'PENDING' : null);
  const isProcessing = pageStage !== null && ACTIVE_STAGES.includes(pageStage);
  const progress = pageStage ? PROGRESS[pageStage] : undefined;
  const processLabel = pageStage === 'READY'
    ? 'Processed'
    : pageStage === 'FAILED' ? 'Retry' : isProcessing ? 'Processing' : 'Process';

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Lexora PoC 0</h1>
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
                    setSelectedPage(nextPage);
                    localStorage.setItem(CURRENT_PAGE_KEY, String(nextPage));
                  }}
                  className="page-input"
                />
                / {book.pageCount}
              </span>
              <button
                onClick={() => void handleProcessPage()}
                disabled={pageStage === 'READY' || isProcessing}
              >
                {processLabel}
              </button>
            </>
          )}

          <select
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="zoom-select"
          >
            <option value={0.75}>75%</option>
            <option value={1.0}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
          </select>

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

          {isProcessing && pageStage && progress !== undefined && (
            <div className="processing-progress" aria-label="Page processing progress">
              <span>{pageStage} processing... {progress}%</span>
              <progress value={progress} max={100} />
            </div>
          )}
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
              spans={spans}
              zoom={zoom}
              showBoxes={showBoxes}
              onSpanClick={handleSpanClick}
            />
          ) : (
            <div className="empty-state">Upload a scanned PDF to begin</div>
          )}
        </div>
        <DebugPanel span={selectedSpan} />
      </main>
    </div>
  );
}
