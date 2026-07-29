import { useState, useCallback, useEffect } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import PageViewer from './reader/PageViewer';
import DebugPanel from './reader/DebugPanel';
import type { TextSpan } from './reader/types';
import { fetchPageAnalysis, getPageAnalysis } from './api/client';
import { readBooleanPreference, writeBooleanPreference } from './state/preferences';

type Status = 'idle' | 'restoring' | 'uploading' | 'processing' | 'ready';

interface BookInfo {
  id: string;
  pageCount: number;
}

const CURRENT_BOOK_KEY = 'lexora.currentBookId';
const CURRENT_PAGE_KEY = 'lexora.currentPage';
const SHOW_BOXES_KEY = 'lexora.showOcrBoxes';

export default function App() {
  const [status, setStatus] = useState<Status>(() => (
    localStorage.getItem(CURRENT_BOOK_KEY) ? 'restoring' : 'idle'
  ));
  const [book, setBook] = useState<BookInfo | null>(null);
  const [selectedPage, setSelectedPage] = useState(() => {
    const storedPage = Number(localStorage.getItem(CURRENT_PAGE_KEY));
    return storedPage > 0 ? storedPage : 1;
  });
  const [spans, setSpans] = useState<TextSpan[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<TextSpan | null>(null);
  const [showBoxes, setShowBoxes] = useState(() => (
    readBooleanPreference(SHOW_BOXES_KEY, false)
  ));
  const [zoom, setZoom] = useState(1.0);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    const bookId = localStorage.getItem(CURRENT_BOOK_KEY);
    if (!bookId) return;

    const restore = async () => {
      setStatus('restoring');
      try {
        const [bookRes, sourceRes, analysis] = await Promise.all([
          fetch(`/api/books/${bookId}`),
          fetch(`/api/books/${bookId}/source`),
          getPageAnalysis(bookId, selectedPage),
        ]);
        if (!bookRes.ok || !sourceRes.ok) throw new Error('Stored book is unavailable');

        const storedBook: BookInfo = await bookRes.json();
        setBook(storedBook);
        setPdfData(await sourceRes.arrayBuffer());
        setSpans(analysis?.textSpans ?? []);
        setStatus('ready');
      } catch (error) {
        localStorage.removeItem(CURRENT_BOOK_KEY);
        setStatus('idle');
        console.error('Restore failed:', error);
      }
    };

    void restore();
  }, []);

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
    if (!info || !info.id) {
      setStatus('idle');
      console.error('Upload returned invalid book info');
      return;
    }
    setBook(info);
    localStorage.setItem(CURRENT_BOOK_KEY, info.id);

    const buffer = await file.arrayBuffer();
    setPdfData(buffer);

    setStatus('processing');
    try {
      const analysis = await fetchPageAnalysis(info.id, selectedPage);
      setSpans(analysis.textSpans);
      setStatus('ready');
    } catch (e) {
      setStatus('ready');
      console.error('Processing failed:', e);
    }
  }, [selectedPage]);

  const handleProcessPage = useCallback(async () => {
    if (!book?.id) return;
    setStatus('processing');
    try {
      const analysis = await fetchPageAnalysis(book.id, selectedPage);
      setSpans(analysis.textSpans);
      setStatus('ready');
    } catch (e) {
      setStatus('ready');
      console.error('Processing failed:', e);
    }
  }, [book, selectedPage]);

  const handleSpanClick = useCallback((span: TextSpan) => {
    setSelectedSpan(span);
  }, []);

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
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
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
                  onChange={(e) => {
                    const page = Number(e.target.value);
                    setSelectedPage(page);
                    localStorage.setItem(CURRENT_PAGE_KEY, String(page));
                  }}
                  className="page-input"
                />
                / {book.pageCount}
              </span>
              <button onClick={handleProcessPage} disabled={status === 'processing'}>
                Process
              </button>
            </>
          )}

          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
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
              onChange={(e) => {
                setShowBoxes(e.target.checked);
                writeBooleanPreference(SHOW_BOXES_KEY, e.target.checked);
              }}
            />
            Show OCR boxes
          </label>

          {status === 'processing' && <span className="status">Processing...</span>}
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
            <div className="empty-state">
              Upload a scanned PDF to begin
            </div>
          )}
        </div>
        <DebugPanel span={selectedSpan} />
      </main>
    </div>
  );
}
